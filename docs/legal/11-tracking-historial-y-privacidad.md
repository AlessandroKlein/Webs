# Cumplimiento legal del plugin de seguimiento (tracking tipo Trakt)

> ⚠️ **Importante**: este documento es una **plantilla de referencia** y **no constituye
> asesoramiento legal**. Debe ser revisado y validado por un abogado habilitado en la
> jurisdicción donde opere la empresa titular (`[NOMBRE_EMPRESA]`). Los requisitos de
> protección de datos y de consumo varían por país.

Este documento define los **requisitos de cumplimiento legal** del plugin de seguimiento
tipo Trakt (Milestone 16 — v2.14.0) de la plataforma **Webs**: historial de visionado,
scrobble, watchlist, favoritos, valoraciones e import/export. Complementa y no reemplaza
los documentos generales de la plataforma:

- [`03-politica-de-privacidad.md`](03-politica-de-privacidad.md) — Política de Privacidad (GDPR/LGPD).
- [`07-terminos-suscripcion-pago.md`](07-terminos-suscripcion-pago.md) — Términos de suscripción y pago.
- [`10-videoteca-derechos-de-autor-y-cumplimiento.md`](10-videoteca-derechos-de-autor-y-cumplimiento.md) — Metadatos de terceros y no-scraping.

## 1. Privacidad y datos personales del historial de visionado

### 1.1 Qué se registra

El plugin de seguimiento registra, por usuario, un **historial de visionado** que incluye:

- **Qué** series o películas consume (título e identificador de catálogo).
- **Cuándo** (marca de tiempo de inicio/pausa/fin).
- **Progreso** (minuto/porcentaje de avance, temporada y episodio).
- Listas personales: **watchlist**, **favoritos** y **valoraciones** (rating).

Estos datos, en conjunto, permiten **perfilar los hábitos de consumo cultural** del
usuario y, por lo tanto, constituyen **datos personales**.

### 1.2 Base legal y régimen aplicable

- **Unión Europea / EEE (GDPR — Reglamento (UE) 2016/679)**: el historial de visionado no
  entra en las categorías especiales del **art. 9** (no revela por sí solo origen étnico,
  opiniones políticas, salud, etc.), pero sí es **dato personal** tratado con efecto de
  **perfilado**. Se requiere una **base legal del art. 6** (típicamente **consentimiento
  explícito e informado** o interés legítimo ponderado), y se activan los derechos de
  **art. 13** (información), **art. 15** (acceso), **art. 17** (supresión / derecho al
  olvido) y **art. 20** (portabilidad).
- **Argentina (Ley 25.326 de Protección de Datos Personales)**: si el titular o los
  usuarios se encuentran en Argentina, aplican los principios de finalidad, calidad y
  consentimiento, y los derechos de acceso, rectificación y supresión del titular del dato.
- **Brasil (LGPD — Lei nº 13.709/2018)**: si aplica, exige base legal, finalidad legítima
  y derechos de acceso, corrección, anonimización y portabilidad.

### 1.3 Principios exigidos

| Principio | Aplicación al tracking |
| --------- | ---------------------- |
| **Consentimiento** | El usuario debe **activar** el tracking de forma explícita e informada (opt-in); nunca habilitado por defecto. |
| **Finalidad** | Los datos se usan **solo** para el historial/watchlist/estadísticas del propio usuario, nunca para publicidad ni perfilado comercial sin consentimiento. |
| **Minimización** | Registrar solo título, identificador, progreso y marca de tiempo; no capturar contenido de audio/video ni metadatos innecesarios. |
| **Retención** | Conservar el historial mientras el usuario lo use; permitir **borrado** en cualquier momento y **retención limitada** de los datos técnicos. |
| **Transparencia** | Informar en la política de privacidad qué se registra, con qué fin y por cuánto tiempo. |

### 1.4 Derechos del usuario

El usuario debe poder, desde la UI:

- **Acceso** y **rectificación** (art. 15/16 GDPR): ver y corregir su historial y listas.
- **Supresión** (art. 17 GDPR / derecho al olvido): borrar su historial completo o
  elementos individuales.
- **Portabilidad** (art. 20 GDPR): **exportar** su historial en formato legible (ver §5).

> La funcionalidad de **import/export** (WB-157) materializa el **derecho de
> portabilidad**: permite al usuario llevarse su historial y reutilizarlo en otro servicio.

## 2. Scrobble desde plataformas de terceros (Netflix / Prime / YouTube)

### 2.1 Alcance permitido

El scrobbler nativo (eventos del reproductor) y la **extensión de navegador
(Manifest V3)** que detecta un elemento `<video>` en páginas de terceros deben **respetar
los Términos de Servicio (ToS)** de cada plataforma. Está permitido **únicamente**:

- **Detectar** que hay una reproducción en curso y **registrar metadatos** (título de la
  obra, posición/progreso, marca de tiempo).
- Enviar esos metadatos al historial del usuario.

### 2.2 Prohibido

| Acción | Fundamento |
| ------ | ---------- |
| **Eludir DRM** (descifrar/extraer contenido protegido) | DMCA (17 U.S.C. §1201) y legislación equivalente; viola el ToS de la plataforma. |
| **Extraer streams** de audio/video (ripping/descarga) | DMCA §512 y ToS de Netflix/Prime/YouTube. |
| **Scraping de contenido** (catálogo, descripciones, portadas) | ToS de cada plataforma. |
| **Interferir** con la reproducción, la publicidad o la interfaz | ToS; puede constituir elusión de medidas técnicas. |

### 2.3 Riesgo y disclaimer

La detección del `<video>` de un reproductor de terceros puede, en algunos casos,
contradecir el ToS de la plataforma aunque solo registre metadatos. El operador
(`[NOMBRE_EMPRESA]`) debe:

- Mostrar un **disclaimer** al activar el scrobble externo: *«El scrobble automático de
  plataformas de terceros se ofrece a conveniencia del usuario; es responsabilidad del
  usuario verificar que su uso cumple los términos de cada plataforma.»*
- Incluir una **cláusula de responsabilidad** en los términos: el operador no garantiza la
  compatibilidad ni el cumplimiento de los ToS de terceros y no asume responsabilidad por
  suspensiones de cuenta derivadas del uso de la extensión.
- Permitir **desactivar** el scrobble por plataforma o globalmente (opt-in/opt-out).

## 3. Metadatos de terceros

Se repite el criterio definido para el plugin videoteca en
[`10-videoteca-derechos-de-autor-y-cumplimiento.md`](10-videoteca-derechos-de-autor-y-cumplimiento.md):

| Fuente | Licencia / condición | Regla |
| ------ | -------------------- | ----- |
| **TMDB** | API gratuita **solo no-comercial**; uso comercial requiere licencia de pago. | Atribución obligatoria con logo y el texto «This product uses the TMDB API but is not endorsed or certified by TMDB.» |
| **Wikipedia** | **CC BY-SA 4.0** (atribución + share-alike). | Atribuir autoría y enlazar la fuente; derivados bajo la misma licencia. |
| **Wikidata** | **CC0** (dominio público). | Atribución recomendada; reutilización libre. |
| **IMDb** | Sin API pública. | Guardar solo el **ID (tt...)** + enlace saliente; **nunca scrapear**. |
| **TheTVDB** | API de pago. | Usar solo con licencia; en su defecto, ID + enlace saliente. |
| **Letterboxd / JustWatch** | Sin API pública / scraping prohibido por ToS. | Guardar **slug/ID** + enlace saliente; **cero scraping**. |

**Regla general**: el plugin guarda **identificadores** (imdb/tmdb/trakt) y **enlaces
salientes**, y **no duplica** ni redistribuye metadatos en bruto de terceros (consistente
con el catálogo compartido por ID del modelo WB-154).

## 4. Suscripciones y planes (feature-gating)

### 4.1 Tiers

El plugin distingue un **tier gratuito** y un **tier de pago** (WB-160):

| Capacidad | Gratuito | De pago |
| --------- | :------: | :-----: |
| Historial de visionado | ✔ | ✔ |
| Watchlist | ✔ | ✔ |
| Scrobble ilimitado | — | ✔ |
| Listas personalizadas | — | ✔ |
| Exportar / importar (CSV/JSON) | — | ✔ |
| Estadísticas avanzadas | — | ✔ |

### 4.2 Términos

- Las condiciones de **renovación, cancelación, reembolso y medios de pago** se rigen por
  [`07-terminos-suscripcion-pago.md`](07-terminos-suscripcion-pago.md).
- El usuario tiene **derecho de desistimiento** (revocación de la suscripción) dentro del
  plazo legal aplicable en su jurisdicción.
- El **propietario final de la plataforma** (`[NOMBRE_EMPRESA]`) decide, vía
  **feature-gating** (ADR-0019), qué capacidades quedan en el tier gratuito y cuáles en el
  de pago; los valores de esta tabla son la **propuesta por defecto** y deben ajustarse a
  la estrategia comercial del titular.

## 5. Import/export (portabilidad de datos)

- El derecho de **portabilidad** (GDPR art. 20) se materializa en la funcionalidad de
  **exportación**: el usuario puede descargar su historial, watchlist, favoritos y
  valoraciones en **CSV** o **JSON** (formatos estructurados, de uso común y legibles por
  máquina).
- La **importación** permite reutilizar esos datos en otro servicio o restaurar una copia
  local; se aplica **deduplicación por identificadores** (imdb/tmdb/trakt) para no
  duplicar registros (WB-157).
- El usuario conserva el derecho a **suprimir** su historial en cualquier momento, aunque
  haya exportado previamente una copia.

## 6. Menores y contenido clasificado por edad

El historial de visionado puede reflejar el consumo de **contenido clasificado por edad**
(películas/series con clasificación etaria). El operador debe:

- Incluir una **nota** en los términos: el plugin registra qué contenido ve el usuario,
  incluido contenido para mayores; corresponde al titular de la cuenta (padre/tutor)
  supervisar el uso de menores a su cargo.
- No realizar **perfilado ni marketing** dirigido a menores a partir de estos datos.
- En la medida en que el servicio procese datos de menores, verificar los requisitos de
  **consentimiento parental** aplicables en la jurisdicción (GDPR art. 8, COPPA en
  EE. UU., o normativa local equivalente).

## 7. Aviso legal y contacto

- **Titular de los datos**: `[NOMBRE_EMPRESA]`, `[DOMICILIO]`, `[JURISDICCIÓN]`.
- **Contacto de privacidad**: `[EMAIL_CONTACTO]`.
- **Autoridad de control**: `[AUTORIDAD_CONTROL]`.
- **Vigencia**: `[FECHA]`.

---

> Este anexo se integra con la **Política de Privacidad** general
> ([`03-politica-de-privacidad.md`](03-politica-de-privacidad.md)) y los **Términos de
> Suscripción y Pago** ([`07-terminos-suscripcion-pago.md`](07-terminos-suscripcion-pago.md)).
> En caso de conflicto entre este anexo y los documentos generales, prevalecen los
> generales salvo indicación expresa.
