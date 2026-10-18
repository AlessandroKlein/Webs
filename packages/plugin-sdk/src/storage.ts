/**
 * Contrato de un driver de almacenamiento de archivos. La plataforma incluye un
 * driver local (por defecto); los bloques (S3/R2/MinIO) registran drivers extra.
 */

export interface StorageDriver {
  /** Identificador único (ej. 'local', 's3'). */
  id: string;
  /** Guarda el contenido y devuelve la URL pública. */
  put(key: string, data: Uint8Array, contentType: string): Promise<string>;
  /** Lee el contenido (null si no existe). */
  get(key: string): Promise<Uint8Array | null>;
  /** Elimina el archivo. */
  delete(key: string): Promise<void>;
}
