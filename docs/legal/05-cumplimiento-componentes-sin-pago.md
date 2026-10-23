# Anexo de cumplimiento — Componentes sin modo de pago

**Última actualización:** [FECHA]

Este anexo confirma el estado de licenciamiento de las dependencias de la plataforma
**Webs**: la totalidad de las dependencias directas listadas son **de código abierto y
sin costo** (licencias permisivas de software libre/open-source), por lo que el uso de la
Plataforma **no requiere el pago de licencias de terceros** ni de regalías por los
componentes de software utilizados.

> **Nota sobre «GrapesJS»**: la tarea original menciona «GrapesJS (MIT)» como ejemplo.
> Verificado el código del repositorio (`apps/`, `packages/` y `plugins/`), **GrapesJS no
> es actualmente una dependencia directa del proyecto**. Su licencia es MIT y, en caso de
> incorporarse como editor visual, quedaría cubierta por este mismo anexo.

## 1. Metodología

La información se obtuvo de los archivos `package.json` de cada workspace del monorepo
(`apps/api`, `apps/web`, `packages/*`, `plugins/*`) y se contrastó con el campo `license`
declarado por cada paquete instalado en `node_modules`. Las licencias identificadas son
todas de tipo **permisivo** (MIT, Apache-2.0, ISC, BSD-2-Clause, MIT-0).

## 2. Listado de licencias de dependencias directas

### 2.1. Aplicación API (`apps/api`)

| Dependencia | Licencia | Costo |
| ----------- | -------- | ----- |
| `fastify` | MIT | Sin costo |
| `@fastify/*` (cookie, cors, helmet, jwt, rate-limit, sensible, swagger, swagger-ui, multipart, websocket) | MIT | Sin costo |
| `fastify-plugin` | MIT | Sin costo |
| `@prisma/client` | Apache-2.0 | Sin costo |
| `@aws-sdk/client-s3` | Apache-2.0 | Sin costo |
| `@simplewebauthn/server`, `@simplewebauthn/types` | MIT | Sin costo |
| `ajv` | MIT | Sin costo |
| `bcryptjs` | MIT | Sin costo |
| `bullmq` | MIT | Sin costo |
| `dotenv` | BSD-2-Clause | Sin costo |
| `exceljs` | MIT | Sin costo |
| `ioredis` | MIT | Sin costo |
| `nodemailer` | MIT-0 | Sin costo |
| `otplib` | MIT | Sin costo |
| `pino` | MIT | Sin costo |
| `rate-limiter-flexible` | ISC | Sin costo |
| `sanitize-html` | MIT | Sin costo |
| `sharp` | Apache-2.0 | Sin costo |
| `zod` | MIT | Sin costo |

### 2.2. Aplicación web (`apps/web`)

| Dependencia | Licencia | Costo |
| ----------- | -------- | ----- |
| `react`, `react-dom` | MIT | Sin costo |
| `react-router-dom` | MIT | Sin costo |
| `@tanstack/react-query` | MIT | Sin costo |
| `zustand` | MIT | Sin costo |
| `i18next`, `react-i18next` | MIT | Sin costo |
| `@tiptap/*` (react, starter-kit, pm, extension-image, extension-link) | MIT | Sin costo |
| `@simplewebauthn/browser` | MIT | Sin costo |
| `bootstrap-icons` | MIT | Sin costo |
| `qrcode` | MIT | Sin costo |

### 2.3. Paquetes compartidos (`packages/*`)

| Dependencia | Licencia | Costo |
| ----------- | -------- | ----- |
| `zod` (plugin-sdk) | MIT | Sin costo |
| `i18next` (i18n) | MIT | Sin costo |
| `@eslint/js` (config) | MIT | Sin costo |
| `typescript-eslint` (config) | MIT | Sin costo |

### 2.4. Herramientas de desarrollo (devDependencies — raíz y workspaces)

| Dependencia | Licencia | Costo |
| ----------- | -------- | ----- |
| `typescript` | Apache-2.0 | Sin costo |
| `prettier` | MIT | Sin costo |
| `vite` | MIT | Sin costo |
| `tailwindcss`, `@tailwindcss/vite` | MIT | Sin costo |
| `@vitejs/plugin-react` | MIT | Sin costo |
| `eslint`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh` | MIT | Sin costo |
| `prisma` (CLI) | Apache-2.0 | Sin costo |
| `tsx`, `tsup` | MIT | Sin costo |
| `rimraf` | ISC | Sin costo |
| `pino-pretty` | MIT | Sin costo |
| `@types/*` | MIT | Sin costo |

### 2.5. Paquetes internos del monorepo (`workspace:*`)

| Paquete | Licencia |
| ------- | -------- |
| `@webs/core`, `@webs/ui`, `@webs/i18n`, `@webs/plugin-sdk`, `@webs/config`, `@webs/api`, `@webs/web`, `@licensify/core` y los plugins bajo `plugins/*` | Código propio del proyecto (propietario/open-source según se defina en el repositorio principal). |

## 3. Resumen de licencias identificadas

| Licencia | Tipo | Naturaleza |
| -------- | ---- | ---------- |
| **MIT** | Permisiva | Libre uso, modificación y distribución, con atribución de copyright. |
| **Apache-2.0** | Permisiva | Libre uso, con concesión de patentes y aviso de cambios. |
| **ISC** | Permisiva | Equivalente funcional a MIT/BSD simplificado. |
| **BSD-2-Clause** | Permisiva | Libre uso con atribución y sin aval implícito. |
| **MIT-0** | Permisiva | Variante de MIT sin cláusula de atribución. |

## 4. Conclusión de cumplimiento

- ✅ Todas las dependencias directas del proyecto son **open-source y sin costo**.
- ✅ Ninguna dependencia directa impone **copyleft fuerte** (GPL/AGPL) que obligue a
  publicar el código propietario del proyecto.
- ✅ No se identificaron dependencias con **licencias de pago, trial o freemium** que
  exijan contratar una suscripción para su uso en producción.
- ℹ️ Los **servicios externos opcionales** (por ejemplo, AWS S3, pasarelas de pago,
  proveedores de correo) pueden tener costos de uso según su propio tarifario, pero no
  son costos de *licencia de software* y solo aplican si el operador decide habilitarlos.
  Ver [`docs/guides/pagos.md`](../guides/pagos.md) y
  [`docs/investigacion-apis-terceros.md`](../investigacion-apis-terceros.md).

## 5. Mantenimiento

Este anexo debe actualizarse cuando se agreguen o eliminen dependencias. Para regenerar la
lista de licencias puede ejecutarse, desde la raíz del monorepo:

```bash
pnpm licenses list --prod --json
```

o herramientas equivalentes de auditoría de licencias (por ejemplo, `license-checker`).

---

*Plantilla adaptable. Reemplazar los placeholders y revisar con asesor legal local antes
de su publicación.*
