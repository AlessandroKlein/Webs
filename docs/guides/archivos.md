# Archivos y multimedia

## Media (núcleo)

El módulo Media permite subir y servir imágenes:

| Endpoint | Descripción |
| -------- | ----------- |
| `POST /media/upload` | Sube una imagen (`multipart`), la procesa con **sharp** (rotación + redimensionado a 1600px + **WebP**) y la guarda. |
| `GET /media` | Lista los medios. |
| `GET /media/files/:key` | Sirve el archivo. |
| `DELETE /media/:id` | Elimina el medio y su archivo. |

Límite: 5 MB, solo imágenes.

## Storage como plugin

El almacenamiento usa un **registro de drivers** (análogo a pagos):

- **`local`** (núcleo, por defecto): guarda en `data/uploads/`.
- **`s3`** (bloque `storage-s3`): Amazon S3, Cloudflare R2 o MinIO.

Configurás el driver activo con la variable `STORAGE_DRIVER` (por defecto
`local`). El bloque `storage-s3` se configura en **Bloques → Storage S3/R2/MinIO**
(con `accessKeyId`/`secretAccessKey` cifrados vía `x-ui.secret`).

```env
STORAGE_DRIVER=s3
```
