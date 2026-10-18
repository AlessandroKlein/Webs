import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { StorageDriver } from '@webs/plugin-sdk';
import { dataDir } from './paths';

/**
 * Registro de drivers de almacenamiento. Incluye un driver **local** (por
 * defecto); los bloques de storage cloud (S3/R2/MinIO) registran drivers extra.
 */

const drivers = new Map<string, StorageDriver>();

export const localDriver: StorageDriver = {
  id: 'local',
  async put(key, data) {
    const dir = path.join(dataDir(), 'uploads');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, key), data);
    return `/api/v1/media/files/${key}`;
  },
  async get(key) {
    const file = path.join(dataDir(), 'uploads', key);
    if (!fs.existsSync(file)) return null;
    return new Uint8Array(fs.readFileSync(file));
  },
  async delete(key) {
    const file = path.join(dataDir(), 'uploads', key);
    if (fs.existsSync(file)) fs.rmSync(file);
  },
};

export function registerStorageDriver(driver: StorageDriver): void {
  drivers.set(driver.id, driver);
}

export function getStorageDriver(id?: string): StorageDriver {
  return drivers.get(id ?? 'local') ?? localDriver;
}

export function newStorageKey(ext: string): string {
  return `${randomUUID()}.${ext}`;
}
