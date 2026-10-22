# Plantillas

Una **plantilla** monta un sitio completo de una vez: instala y activa plugins,
aplica ajustes (nombre, tema) y crea el menú principal. Se usa para arrancar
rápido un **gimnasio**, un **mercado**, un **blog**…

## Formato

`templates/<id>.json`:

```json
{
  "id": "gym",
  "name": "Gimnasio",
  "description": "Sitio para gimnasios: clases, horarios, planes y membresías.",
  "blocks": [
    { "id": "example", "config": { "greeting": "Bienvenido a tu gimnasio" } }
  ],
  "settings": {
    "site": { "name": "Mi Gimnasio", "tagline": "Entrená sin límites" },
    "appearance": { "primaryColor": "#16a34a" }
  },
  "menu": [
    { "label": "Inicio", "path": "/", "order": 0 },
    { "label": "Clases", "path": "/clases", "order": 1 }
  ]
}
```

| Campo | Descripción |
| ----- | ----------- |
| `id` | Identificador único de la plantilla. |
| `name` / `description` | Nombre y descripción visible. |
| `blocks[]` | Plugins a instalar/activar, con `config` opcional (la key conserva el nombre interno `blocks` de forma transitoria). |
| `settings` | Ajustes por sección (`site`, `appearance`, …) a aplicar. |
| `menu` | Ítems del menú principal (`label`, `path`, `order`). |

## Uso

- **UI**: **Plantillas → Aplicar plantilla**.
- **API**: `POST /api/v1/templates/:id/apply`.

La aplicación es *best-effort*: si un plugin no está disponible en el catálogo,
se omite con una advertencia (el resto se aplica igual).

> Los plugins se activan en caliente (si no estaban cargados); los cambios de
> `config` de plugins ya cargados toman efecto al reiniciar la API.
