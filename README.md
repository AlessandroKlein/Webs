# Webs

Plataforma web **modular, escalable y multiidioma** construida en Node.js.
Es la base para crear proyectos concretos (tienda, gimnasio, blog, etc.)
mediante **bloques/plugins** instalables, configurables 100% desde una interfaz
de administración — sin que el cliente final toque código.

## Stack

| Capa        | Tecnología                                              |
| ----------- | ------------------------------------------------------- |
| Backend     | Node.js + **Fastify 5** (REST + WebSocket), TypeScript  |
| Frontend    | **React 19 + Vite**, React Router, TanStack Query, Zustand |
| Base de datos | **PostgreSQL** + Prisma 6                               |
| Caché/pubsub | Redis (opcional, para clúster y WebSocket)              |
| i18n        | i18next (es/en por defecto)                             |
| Temas       | Tokens CSS + modo claro/oscuro + CSS personalizado      |
| Monorepo    | pnpm workspaces                                        |

## Características clave

- **Sistema de bloques/plugins** estilo WordPress: cada bloque es un paquete con
  un manifiesto `block.json`, lógica de backend (Fastify), render de frontend,
  esquema de configuración (JSON Schema) y hooks de ciclo de vida.
- **Configuración total desde la UI**: nombre del sitio, logo, SEO, políticas
  legales, contacto, colores, CSS personalizado, traducciones… todo se edita
  desde el panel, con formularios auto-generados a partir de esquemas JSON.
- **Roles y permisos (RBAC)** granulares, con roles por defecto
  (`super_admin`, `admin`, `editor`, `user`).
- **Multiidioma** con traducciones base es/en y sobrescritura desde la UI.
- **Temas claro/oscuro** basados en tokens CSS.
- **Escalable**: API stateless, WebSocket sincronizado por Redis, listo para
  Kubernetes/clúster.
- **Documentación completa** en `docs/` (publicada en el repositorio Docs).

## Estructura del monorepo

```
apps/
  api/          # Backend Fastify (REST + WS, módulos, loader de bloques)
  web/          # Frontend React (sitio público + panel de administración)
packages/
  core/         # Tipos, errores, constantes y utilidades compartidas
  plugin-sdk/   # SDK para crear bloques (contrato público)
  i18n/         # Internacionalización base
  ui/           # Sistema de temas y tokens de diseño
  config/       # ESLint y Prettier compartidos
blocks/
  example-block/  # Bloque de referencia (plantilla)
docs/             # Documentación (arquitectura, API, guías, ADRs)
docker/           # Docker Compose y Dockerfiles
infra/            # Notas de infraestructura y escalado
```

## Inicio rápido

### Opción A — Docker (recomendado, todo en uno)

```bash
git clone https://github.com/AlessandroKlein/Webs.git
cd Webs
docker compose up -d --build     # o: make up
```

Abrí **http://localhost:5173**: se muestra el **asistente de instalación** con los
valores de conexión ya pre-cargados (PostgreSQL/MySQL de Docker o SQLite). Elegí
el motor, configurá sitio/SMTP/admin y listo. Todo sin tocar código.

### Opción B — Desarrollo local (Node + pnpm)

Requisitos: Node.js ≥ 22, pnpm ≥ 9, y PostgreSQL/MySQL (o SQLite, sin servicio).

```bash
pnpm install
pnpm build
pnpm dev
```

- **API**: http://localhost:4000 · Swagger en http://localhost:4000/docs
- **Web**: http://localhost:5173 · Panel en `/` (login) · Sitio público de ejemplo en `/site`

> Guías: [instalación](docs/guides/instalacion.md) · [getting-started](docs/guides/getting-started.md).

## Documentación

- [Arquitectura](docs/architecture/overview.md) — decisiones y diseño del sistema.
- [Sistema de bloques](docs/architecture/block-system.md) — el corazón de la plataforma.
- [API REST](docs/api/overview.md) y [WebSocket](docs/api/websocket.md).
- [Crear un bloque](docs/guides/crear-un-bloque.md) — guía para desarrolladores.
- [Despliegue](docs/guides/despliegue.md) y [escalabilidad](docs/architecture/scalability.md).

## Ramas y releases

- `main` — estable (releases etiquetados `vX.Y.Z`).
- `develop` — integración.
- Ramas `feature/*` para web, app móvil, bloques, etc.

Ver [CONTRIBUTING.md](CONTRIBUTING.md).

## Licencia

[MIT](LICENSE)
