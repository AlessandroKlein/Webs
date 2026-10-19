/**
 * Respaldo de la base de datos. Determina el motor desde DATABASE_URL:
 *  - SQLite: copia el archivo.
 *  - PostgreSQL: usa `pg_dump`.
 *  - MySQL: usa `mysqldump` (best-effort).
 * Guarda en `data/backups/`.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const url = process.env.DATABASE_URL;
const dataDir = process.env.DATA_DIR ?? path.join(process.cwd(), 'data');
const backupDir = path.join(dataDir, 'backups');
fs.mkdirSync(backupDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');

if (!url) {
  console.error('DATABASE_URL no definida');
  process.exit(1);
}

function parsePieces(protocol) {
  // Sin protocolo, por ejemplo "postgresql://user:pass@host:port/db?schema=public"
  const rest = url.slice(protocol.length);
  const [authHost, dbPart] = rest.split('/');
  const [userPass, hostPort] = authHost.split('@');
  const [user, pass] = userPass.split(':');
  const [host, port] = hostPort.split(':');
  const db = (dbPart ?? '').split('?')[0];
  return { user, pass, host, port: port ?? '5432', db };
}

try {
  if (url.startsWith('file:')) {
    const dbPath = url.replace('file:', '');
    const file = path.resolve(process.cwd(), dbPath);
    const dest = path.join(backupDir, `webs-${stamp}.db`);
    fs.copyFileSync(file, dest);
    console.log(dest);
  } else if (url.startsWith('postgresql://')) {
    const { user, pass, host, port, db } = parsePieces('postgresql://');
    const dest = path.join(backupDir, `webs-${stamp}.sql`);
    execFileSync('pg_dump', [`-h`, host, '-p', port, '-U', user, '-d', db, '-f', dest], {
      env: { ...process.env, PGPASSWORD: pass },
      stdio: 'inherit',
    });
    console.log(dest);
  } else if (url.startsWith('mysql://')) {
    const { user, pass, host, port, db } = parsePieces('mysql://');
    const dest = path.join(backupDir, `webs-${stamp}.sql`);
    execFileSync('mysqldump', [`-h`, host, '-P', port, '-u', user, `-p${pass}`, db], {
      stdio: ['ignore', fs.openSync(dest, 'w'), 'inherit'],
    });
    console.log(dest);
  } else {
    console.error('Proveedor no soportado para backup');
    process.exit(1);
  }
} catch (err) {
  console.error('Error al respaldar:', err.message);
  process.exit(1);
}
