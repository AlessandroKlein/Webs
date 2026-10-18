# Idiomas: selección y carga bajo demanda

Webs permite elegir **qué idiomas** habilita el sitio (uno o varios) y solo
descarga los recursos de esos idiomas, evitando peso innecesario.

## Cómo funciona

1. **Catálogo de idiomas**: la plataforma define los idiomas disponibles en
   `@webs/i18n` (`AVAILABLE_LOCALES`, actualmente `es`, `en`, `pt`). Agregar un
   idioma nuevo es añadir su archivo de traducción y una entrada en ese catálogo.
2. **Selección**: el administrador elige los idiomas habilitados (y el idioma por
   defecto) en el **asistente de instalación** o luego en **Ajustes → Sitio**
   (campo "Idiomas habilitados").
3. **Carga bajo demanda**: el frontend no incluye las traducciones compiladas;
   al arrancar consulta `GET /api/v1/public/i18n`, que devuelve **solo** los
   idiomas habilitados y los aplica a i18next. Los idiomas no habilitados nunca
   se descargan.

## Endpoints públicos

| Endpoint | Devuelve |
| -------- | -------- |
| `GET /api/v1/public/locales` | Catálogo de idiomas disponibles. |
| `GET /api/v1/public/i18n` | Idiomas habilitados + sus recursos (base + sobrescrituras del admin). |

Los recursos se fusionan así (en ese orden de precedencia):

1. Traducciones base (compiladas en `@webs/i18n`).
2. Sobrescrituras del administrador (tabla `Translation`, editables en
   **Ajustes → Traducciones**).

## Mismo patrón para módulos/bloques

Los bloques aportan sus propias traducciones declarándolas en `block.json`
(campo `translations`: locale → clave → texto). Al instalarse, el backend las
registra y `/public/i18n` las incluye en un **namespace propio (el id del
bloque)**, solo si el idioma está habilitado **y** el bloque está instalado. Así,
ni idiomas ni módulos no usados añaden peso al cliente.

```json
{
  "id": "example",
  "translations": {
    "es": { "greeting": "¡Hola!" },
    "en": { "greeting": "Hello!" }
  }
}
```

En el `mount` del bloque, `i18n.t('greeting')` resuelve automáticamente en su
propio namespace.
