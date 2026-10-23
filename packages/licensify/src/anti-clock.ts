import { performance } from "node:perf_hooks";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { ClockRollbackError } from "./errors.js";
import type { ClockStore } from "./types.js";

/**
 * Anti-clock (clock rollback detection).
 *
 * The guard combines two independent clocks:
 * - a **monotonic** clock (`performance.now()`), which cannot go backwards
 *   within a process; and
 * - a **persisted** wall-clock timestamp, which survives restarts.
 *
 * If the observed time is earlier than the last seen time by more than the
 * configured tolerance (default 60s, to tolerate minor NTP corrections), a
 * {@link ClockRollbackError} is raised. This makes rolling the system clock
 * back to extend a time-limited license harder.
 */

/** High-resolution monotonic time in milliseconds (process-relative). */
export function monotonicNowMs(): number {
  return performance.now();
}

/** In-memory clock store (ephemeral; mainly for tests). */
export class MemoryClockStore implements ClockStore {
  private value: number | null = null;
  load(): number | null {
    return this.value;
  }
  save(timestamp: number): void {
    this.value = timestamp;
  }
}

/** File-backed clock store (persists the last-seen timestamp across restarts). */
export class FileClockStore implements ClockStore {
  constructor(private readonly filePath: string) {}

  load(): number | null {
    try {
      if (!existsSync(this.filePath)) {
        return null;
      }
      const raw = readFileSync(this.filePath, "utf8").trim();
      const value = Number(raw);
      return Number.isFinite(value) ? value : null;
    } catch {
      return null;
    }
  }

  save(timestamp: number): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, String(timestamp), "utf8");
  }
}

export interface ClockGuardOptions {
  /** Maximum tolerated backwards drift in ms (default 60_000). */
  toleranceMs?: number;
  /** Persistence backend (default: in-memory). */
  store?: ClockStore;
}

/** Detects clock rollback across monotonic and persisted wall-clock time. */
export class ClockGuard {
  private readonly toleranceMs: number;
  private readonly store: ClockStore;
  private lastMonotonic: number | null = null;

  constructor(options: ClockGuardOptions = {}) {
    this.toleranceMs = options.toleranceMs ?? 60_000;
    this.store = options.store ?? new MemoryClockStore();
  }

  /**
   * Record the current time and detect rollback. Returns the accepted wall
   * clock timestamp in ms, or throws {@link ClockRollbackError}.
   */
  check(nowWallClock = Date.now()): number {
    const nowMonotonic = monotonicNowMs();
    if (this.lastMonotonic !== null && nowMonotonic < this.lastMonotonic - this.toleranceMs) {
      throw new ClockRollbackError(this.lastMonotonic, nowMonotonic);
    }
    this.lastMonotonic = nowMonotonic;

    const persisted = this.store.load();
    if (persisted !== null && nowWallClock < persisted - this.toleranceMs) {
      throw new ClockRollbackError(persisted, nowWallClock);
    }
    this.store.save(nowWallClock);
    return nowWallClock;
  }

  /** The last wall-clock timestamp persisted by this guard, if any. */
  lastSeen(): number | null {
    return this.store.load();
  }
}
