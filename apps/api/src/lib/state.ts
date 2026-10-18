import fs from 'node:fs';
import path from 'node:path';
import { dataDir } from './paths';

/**
 * Estado de instalación de Webs. Persiste en un archivo local (`data/`) lo
 * mínimo necesario para reconectar la base de datos en cada arranque. El resto
 * de la configuración (sitio, SMTP, etc.) vive en la base de datos.
 */
export interface WebsState {
  /** Indica si la instalación ya se completó. */
  installed: boolean;
  /** Proveedor elegido: postgresql | sqlite | mysql. */
  databaseProvider?: string;
  /** URL de conexión (incluye credenciales). */
  databaseUrl?: string;
  installedAt?: string;
}

const STATE_FILE = () => path.join(dataDir(), 'webs.config.json');

export function readState(): WebsState {
  try {
    const raw = fs.readFileSync(STATE_FILE(), 'utf8');
    const parsed = JSON.parse(raw) as Partial<WebsState>;
    return {
      installed: parsed.installed ?? false,
      databaseProvider: parsed.databaseProvider,
      databaseUrl: parsed.databaseUrl,
      installedAt: parsed.installedAt,
    };
  } catch {
    return { installed: false };
  }
}

export function writeState(state: WebsState): void {
  fs.mkdirSync(dataDir(), { recursive: true });
  fs.writeFileSync(STATE_FILE(), JSON.stringify(state, null, 2), 'utf8');
}
