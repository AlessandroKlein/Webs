import * as os from "node:os";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import type { FingerprintOptions } from "./types.js";
import { hexToBytes, sha256, sha256Hex } from "./util.js";

/**
 * Node-locking fingerprint.
 *
 * The fingerprint is a deterministic SHA-256 of a set of hardware/OS signals
 * (machine-id, MAC addresses, hostname, CPU model, OS). Only the **hash** is
 * ever persisted or transmitted — never the raw identifiers — so the raw
 * hardware data does not leak through a stored license.
 *
 * The fingerprint is used to derive the AES key that protects the activation
 * key: a license activated on machine A cannot be decrypted on machine B.
 */

/**
 * Best-effort `/etc/machine-id` (Linux) / `IOPlatformUUID` (macOS).
 *
 * `os.machineId()` was added in newer Node releases (24+) and is not present
 * in all runtimes or type definitions, so it is accessed defensively.
 */
function readMachineId(): string | null {
  const machineId = (os as unknown as { machineId?: () => string }).machineId;
  if (typeof machineId === "function") {
    try {
      const id = machineId();
      if (id && id !== "00000000-0000-0000-0000-000000000000") {
        return id;
      }
    } catch {
      // fall through to platform-specific best effort
    }
  }
  if (process.platform === "linux") {
    try {
      return readFileSync("/etc/machine-id", "utf8").trim();
    } catch {
      // not available
    }
  }
  return null;
}

/** Best-effort Windows MachineGuid from the registry. */
function readWindowsMachineGuid(): string | null {
  if (process.platform !== "win32") {
    return null;
  }
  try {
    const output = execFileSync(
      "reg",
      ["query", "HKLM\\SOFTWARE\\Microsoft\\Cryptography", "/v", "MachineGuid"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    const match = output.match(/MachineGuid\s+REG_SZ\s+([0-9a-fA-F-]+)/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

/** Collect MAC addresses, sorted for determinism. */
function readMacAddresses(): string[] {
  const interfaces = os.networkInterfaces();
  const macs: string[] = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] ?? []) {
      if (iface.mac && iface.mac !== "00:00:00:00:00:00" && !iface.internal) {
        macs.push(`${name}:${iface.mac}`);
      }
    }
  }
  return macs.sort();
}

/**
 * Compute a deterministic node fingerprint (64 lowercase hex chars).
 *
 * The default signal set is intentionally conservative and stable across
 * reboots. Vendors can strengthen it via {@link FingerprintOptions.extraSignals}
 * (e.g. a disk serial retrieved by the host application) and scope it per
 * product with `salt`.
 */
export function getFingerprint(options: FingerprintOptions = {}): string {
  const signals: string[] = [
    `machineId=${readMachineId() ?? ""}`,
    `winGuid=${readWindowsMachineGuid() ?? ""}`,
    `hostname=${os.hostname()}`,
    `platform=${os.platform()}`,
    `arch=${os.arch()}`,
    `release=${os.release()}`,
    `cpu=${os.cpus()[0]?.model ?? ""}`,
    `macs=${readMacAddresses().join(",")}`,
    ...(options.extraSignals ?? []),
  ];
  const base = signals.join("|");
  const salted = options.salt ? `${options.salt}::${base}` : base;
  return sha256Hex(salted);
}

/** Convert a 64-char hex fingerprint to its raw 32 bytes (for key derivation). */
export function fingerprintToBytes(fingerprintHex: string): Buffer {
  return hexToBytes(fingerprintHex);
}

/**
 * Derive the 32-byte AES key used to encrypt/decrypt an activation key from a
 * fingerprint plus a per-key random salt.
 */
export function deriveFingerprintKey(fingerprintHex: string, salt: Buffer): Buffer {
  return sha256(Buffer.concat([fingerprintToBytes(fingerprintHex), salt]));
}
