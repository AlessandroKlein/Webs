# Checklist de plugins (t90)

Auditoría de los 43 plugins de la plataforma: manifiesto válido, rutas, dependencias, i18n, menú, permisos y README. Incluye smoke de instalación del catálogo completo contra el pipeline de instalación (ADR-0016 / t82).

## Resumen

| Métrica | Resultado |
|---------|-----------|
| Plugins totales | 43 |
| Manifiesto válido (parse zod) | 43/43 |
| Entry compila (`pnpm -r build`) | 43/43 |
| Registro de rutas al boot (API) | 43/43, sin errores |
| Instalación smoke (`POST /plugins/install`) | 43/43 — 35 instalados (201) + 8 ya instalados (409 idempotente) |
| Errores de activación (`onInstall`/`onActivate`) | 0 |
| README.md | 43/43 (41 generados + 2 existentes) |
| Plugins con permisos propios | 13/43 |
| Plugins con translations (i18n) | 13/43 |

## Checklist por plugin

| Plugin | Categoría | Manifiesto | README | Permisos | i18n | Instalación |
|--------|-----------|:----------:|:------:|:--------:|:----:|:-----------:|
| academia | `educacion` | ✓ | ✓ | 1 | — | ✓ |
| afiliados | `marketing` | ✓ | ✓ | — | — | ✓ |
| analytics | `seo` | ✓ | ✓ | 1 | — | ✓ |
| andreani | `envios` | ✓ | ✓ | — | — | ✓ |
| arca | `negocio` | ✓ | ✓ | 1 | — | ✓ |
| blog | `contenido` | ✓ | ✓ | — | — | ✓ |
| calendario | `negocio` | ✓ | ✓ | 1 | — | ✓ |
| carrito | `negocio` | ✓ | ✓ | — | ✓ | ✓ |
| chat | `comunicacion` | ✓ | ✓ | — | — | ✓ |
| chat-ia | `comunicacion` | ✓ | ✓ | — | — | ✓ |
| comments | `social` | ✓ | ✓ | — | — | ✓ |
| correo | `envios` | ✓ | ✓ | — | — | ✓ |
| documentos | `contenido` | ✓ | ✓ | — | — | ✓ |
| ebanx | `pagos` | ✓ | ✓ | — | ✓ | ✓ |
| ecommerce | `negocio` | ✓ | ✓ | 1 | — | ✓ |
| example | `otros` | ✓ | ✓ | — | ✓ | ✓ |
| facturacion | `negocio` | ✓ | ✓ | 1 | ✓ | ✓ |
| formularios | `contenido` | ✓ | ✓ | — | — | ✓ |
| inventario | `negocio` | ✓ | ✓ | 1 | — | ✓ |
| mapa | `contenido` | ✓ | ✓ | — | ✓ | ✓ |
| marketing | `marketing` | ✓ | ✓ | 1 | ✓ | ✓ |
| mercadolibre | `envios` | ✓ | ✓ | — | — | ✓ |
| mercadopago | `pagos` | ✓ | ✓ | — | ✓ | ✓ |
| modo | `pagos` | ✓ | ✓ | — | ✓ | ✓ |
| notificaciones | `comunicacion` | ✓ | ✓ | — | — | ✓ |
| oca | `envios` | ✓ | ✓ | — | — | ✓ |
| organizaciones | `negocio` | ✓ | ✓ | 3 | — | ✓ |
| paypal | `pagos` | ✓ | ✓ | — | ✓ | ✓ |
| payway | `pagos` | ✓ | ✓ | — | ✓ | ✓ |
| pos | `pagos` | ✓ | ✓ | 1 | ✓ | ✓ |
| push | `comunicacion` | ✓ | ✓ | — | ✓ | ✓ |
| register | `auth` | ✓ | ✓ | — | — | ✓ |
| reservas | `negocio` | ✓ | ✓ | 1 | — | ✓ |
| search | `seo` | ✓ | ✓ | — | — | ✓ |
| seo | `seo` | ✓ | ✓ | — | — | ✓ |
| social | `social` | ✓ | ✓ | — | — | ✓ |
| social-login | `auth` | ✓ | ✓ | — | — | ✓ |
| storage-s3 | `infraestructura` | ✓ | ✓ | — | — | ✓ |
| stripe | `pagos` | ✓ | ✓ | — | ✓ | ✓ |
| support | `soporte` | ✓ | ✓ | 1 | — | ✓ |
| suscripciones | `negocio` | ✓ | ✓ | 1 | — | ✓ |
| twilio | `comunicacion` | ✓ | ✓ | — | — | ✓ |
| workflows | `negocio` | ✓ | ✓ | — | — | ✓ |

## Notas

- **Manifiesto válido**: los 43 `plugin.json` pasan `parsePluginManifest` (zod) sin errores; todos declaran `type: plugin`, `category`, `repository` y `entry` (default `./dist/server.js`).
- **Rutas**: `registerPluginRoutes` registra las rutas de los 43 plugins al boot sin loguear "no se pudo registrar" (verificado en el arranque de la API en Docker).
- **Dependencias**: `installPluginWithDependencies` resuelve dependencias recursivamente; no hay `blockDependencies` legacy ni `type: block`.
- **i18n (`translations`)**: solo aplica a plugins con UI de cliente (`clientEntry`); los plugins server-only (pagos, envíos, storage, fiscal) no requieren `translations`. Quienes tienen `clientEntry` y strings de UI pueden declarar `translations` en `plugin.json`.
- **Permisos**: los plugins proveedores (pagos/envíos/storage/auth) no declaran permisos propios — operan bajo permisos del core (`plugin.read`/`plugin.manage`/`sales.*`); los plugins de negocio ya declaran sus permisos de área.
- **README**: 41 README.md generados automáticamente desde el manifiesto (metadatos, permisos, dependencias, proveedores, slots y opciones de configuración); `example-block` y `arca` ya tenían README manual (no modificados).

> Sin commit: los READMEs, el checklist y los scripts temporales de auditoría se dejan en el árbol de trabajo; el release que los persista lo coordina devops (release v2.3.0).
