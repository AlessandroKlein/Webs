# @webs/plugin-sdk

SDK oficial para crear **bloques/plugins** de la plataforma Webs. Un bloque es un
paquete autocontenido que extiende la plataforma (estilo WordPress) sin que el
cliente final tenga que tocar código.

## Qué puede hacer un bloque

- Registrar **rutas HTTP y WebSocket** en el backend (Fastify).
- Declarar un **esquema de configuración** (JSON Schema): la UI de administración
  genera el formulario de ajustes automáticamente.
- Registrar **componentes de cliente** que se montan en **slots** (regiones del sitio).
- Declarar **permisos** propios.
- Ejecutar **hooks de ciclo de vida** (`onInstall`, `onUninstall`, `onActivate`, `onDeactivate`).
- Aportar sus propias **traducciones**.

## Estructura de un bloque

```
my-block/
├── block.json        # manifiesto (metadatos, entradas, settings, slots, permisos)
├── src/
│   ├── server.ts     # default-export defineBlock(...)  → lógica backend
│   └── client.ts     # default-export defineClientBlock(...) → render cliente
└── package.json      # name, version, peers
```

## Ejemplo mínimo (servidor)

```ts
import { defineBlock } from '@webs/plugin-sdk';

export default defineBlock(
  {
    name: '@acme/block-hello',
    id: 'hello',
    version: '1.0.0',
    type: 'block',
    displayName: { en: 'Hello', es: 'Hola' },
    description: { en: 'Says hello', es: 'Saluda' },
    author: 'Acme',
    entry: './src/server.js',
    clientEntry: './src/client.js',
    apiVersion: '1.0.0',
    slots: ['content'],
    settings: {
      type: 'object',
      properties: {
        greeting: { type: 'string', default: 'Hello world', title: 'Saludo' },
      },
    },
  },
  {
    register: async (fastify) => {
      fastify.get('/', async () => ({ ok: true }));
    },
    hooks: {
      onInstall: async (ctx) => ctx.logger.info('instalado'),
    },
  },
);
```

> Consulta `docs/guides/crear-un-bloque.md` para la guía completa.
