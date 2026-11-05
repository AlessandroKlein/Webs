# Cumplimiento legal — Plugin Videoteca (derechos de autor, APIs de terceros y enlaces externos)

**Última actualización:** [FECHA]

> ⚠️ **Importante**: este documento es una **guía de cumplimiento de referencia** para el
> operador del plugin **videoteca** de la plataforma **Webs** (M15/v2.13.0) y **no
> constituye asesoramiento legal**. La normativa de propiedad intelectual (DMCA en EE. UU.,
> Ley 11.723 en Argentina, la Directiva de derechos de autor en la UE y las leyes locales
> de cada jurisdicción) y los términos de servicio de los proveedores citados cambian con
> frecuencia. Antes de publicar el plugin, valida este documento con un **abogado
> habilitado en [JURISDICCIÓN]**.

## 1. Objeto y alcance

Este documento establece las reglas de **cumplimiento legal y de términos de servicio**
que debe respetar la implementación y la operación del plugin **videoteca** (catálogo de
series y películas). Cubre cinco frentes:

1. El **botón «ver/descargar»** y la delimitación de su uso legítimo.
2. El uso de la **API de TMDB** (metadatos).
3. El uso de **Wikipedia/Wikidata** (respaldo de metadatos).
4. El tratamiento de **IDs externos** (IMDb, TheTVDB, Letterboxd, JustWatch).
5. El **embedding** de contenido mediante oEmbed (YouTube, Vimeo, Dailymotion, Twitch,
   TikTok).

Aplica al operador del sitio (**[NOMBRE_EMPRESA]**, en adelante el **«Operador»**) y al
equipo técnico que implemente el plugin.

## 2. Principio general: enlazar, no reproducir

La regla rectora del plugin es **enlazar (linking) y no reproducir (hosting)**:

- ✅ **Permitido**: enlazar al contenido en la plataforma oficial donde está legalmente
  disponible (Netflix, Prime Video, Apple TV, YouTube Movies, Google Play, etc.), incrustar
  players oficiales mediante oEmbed/iframe, y reproducir **archivos propios** sobre los que
  el Operador tenga derechos o licencia.
- ❌ **Prohibido**: reproducir, descargar, almacenar, retransmitir o «ripear» contenido
  protegido por derechos de autor sin autorización, así como extraer el stream subyacente
  de un embed o eludir medidas técnicas de protección.

> Enlazar a un contenido legalmente disponible **no transfiere** ningún derecho sobre ese
> contenido al Operador; el Operador solo facilita el acceso.

## 3. Botón «ver/descargar» — uso legítimo y prohibiciones

### 3.1. Enlaces a plataformas oficiales (permitido)

El botón puede mostrar enlaces a las páginas oficiales de los títulos en:

- Plataformas de **streaming** (Netflix, Prime Video, Apple TV, Disney+, Max, etc.).
- Plataformas de **alquiler/compra digital** (YouTube Movies, Google Play, Apple TV/iTunes,
  Microsoft Store, etc.).
- Sitios **oficiales** del estudio, distribuidor o titular de los derechos.

Estos enlaces deben apuntar a **URLs oficiales** (dominios de la plataforma) y no a
mirrors, sitios de descarga no autorizados ni reproductores de terceros.

### 3.2. Archivos propios (permitido solo con derechos o licencia)

El botón «descargar» solo puede ofrecer **archivos propios** (mp4/HLS u otros) cuando el
Operador:

- es el **titular** de los derechos de autor del contenido, o
- cuenta con una **licencia** o autorización expresa del titular que le permita la
  descarga/distribución.

> **Recomendación**: conservar evidencia documental de la titularidad o licencia de cada
> archivo propio ofrecido para descarga (contrato, cesión de derechos, licencia escrita).

### 3.3. Prohibición expresa de rip/descarga de contenido protegido

Queda **expresamente prohibido**:

- **Ripear** (descargar/extraer) contenido de plataformas de streaming.
- Ofrecer enlaces a **descargas no autorizadas**, torrents, mirrors o sitios piratas.
- **Eludir medidas técnicas de protección** (DRM, cifrado, restricciones de descarga).
- Extraer el **stream** de un embed o reproductor de terceros.

Esta prohibición se funda, entre otras normas, en:

- **DMCA (EE. UU.)**: la prohibición de eludir medidas tecnológicas de protección
  (17 U.S.C. § 1201) y el régimen de *notice and takedown* para proveedores de servicios
  (17 U.S.C. § 512).
- **Ley 11.723 (Argentina)**: régimen legal de la propiedad intelectual y sus sanciones,
  incluidas las previstas para la elusión de medidas tecnológicas de protección.
- **Términos de servicio** de cada plataforma de streaming (que prohíben la descarga no
  autorizada y la redistribución).

### 3.4. Texto de disclaimer para mostrar junto al botón

> **Aviso**: los enlaces «ver» dirigen a las **plataformas oficiales** donde cada título
> está legalmente disponible; el acceso puede requerir suscripción, alquiler o compra. La
> opción «descargar» solo se ofrece para **contenido propio** del sitio o contenido sobre
> el que el Operador posee derechos o licencia. **[NOMBRE_EMPRESA]** no aloja, reproduce ni
> distribuye contenido protegido por derechos de autor de terceros.

### 3.5. Cláusula de responsabilidad del Operador

> El **Operador** es el único responsable de: (a) verificar que todo archivo propio ofrecido
> para descarga cuenta con los derechos o la licencia necesarios; (b) asegurar que los
> enlaces apuntan a plataformas oficiales y no a sitios no autorizados; y (c) dar de baja
> de inmediato cualquier contenido o enlace notificado como infractor (DMCA/notice and
> takedown), conforme al procedimiento de la sección 8.

## 4. TMDB (The Movie Database) — API de metadatos

### 4.1. Naturaleza y condiciones de uso

- La **API de TMDB** es **gratuita únicamente para uso no comercial**.
- El **uso comercial** requiere una **licencia de pago** con TMDB. Si el sitio que usa el
  plugin **videoteca** es comercial (venta de suscripciones, publicidad, cobro al usuario),
  el Operador debe contratar la licencia comercial de TMDB **antes** de habilitar la
  integración.
- La clave de API de TMDB se configura **por tenant** (organización) y cada Operador es
  responsable de su propia clave y de su cumplimiento.

### 4.2. Atribución obligatoria

Todo uso de datos de TMDB debe mostrar, de forma visible:

1. El **logo de TMDB** (descargable de su sitio oficial), y
2. El texto exacto de atribución:

> This product uses the TMDB API but is not endorsed or certified by TMDB.

La atribución debe colocarse junto a los datos obtenidos de TMDB (por ejemplo, en la página
de detalle y/o en el pie del catálogo).

### 4.3. Otras obligaciones relevantes

- **No scraping**: no extraer masivamente la web de TMDB; usar solo la API.
- **Caché razonable**: se permite cachear resultados para rendimiento, pero no
  **redistribuir** la base de datos completa de TMDB ni sus datos en bruto a terceros.
- **Sin uso en productos competidores** que repliquen la base de datos de TMDB (verificar
  los términos vigentes).
- **Respetar los límites de la API** (rate limits) y las políticas de uso vigentes de TMDB.

## 5. Wikipedia / Wikidata — respaldo de metadatos

### 5.1. Licencias

- **Wikipedia (prosa de artículos)**: contenido bajo **CC BY-SA 4.0** (Creative Commons
  Atribución-CompartirIgual). Obliga a **atribuir** y, si se reutiliza/adapta, a mantener la
  **misma licencia (ShareAlike)**.
- **Wikidata (datos estructurados)**: los hechos/datos están en **CC0** (dominio público),
  por lo que **no exigen atribución legal**, aunque se recomienda atribuir como buena
  práctica.

### 5.2. Atribución requerida

Al mostrar texto o contenido derivado de **Wikipedia**, se debe:

- Enlazar al **artículo fuente** de Wikipedia (URL canónica).
- Indicar que el contenido está bajo **CC BY-SA 4.0** y enlazar a la licencia.
- No insinuar que Wikimedia respalda el sitio.

> El plugin debe **enlazar** a la fuente de Wikipedia/Wikidata en lugar de replicar
> artículos completos. Para una cita breve o una sinopsis, atribuir siempre.

## 6. IDs externos (IMDb, TheTVDB, Letterboxd, JustWatch) — política no-scraping

### 6.1. Política general

Para estos proveedores, la regla es: **guardar el ID/slug y enlazar saliente; nunca
scrapear**.

- El plugin **solo almacena identificadores** (por ejemplo, el ID `ttXXXXXXX` de IMDb o el
  slug de Letterboxd) como datos de referencia.
- El plugin **no extrae** contenido, carátulas, puntuaciones ni metadatos de estos sitios.
- Cada ID se convierte en un **enlace saliente** al sitio oficial del proveedor.

### 6.2. Detalle por proveedor

| Proveedor | API oficial pública | Estado / política | Acción del plugin |
| --------- | ------------------- | ----------------- | ----------------- |
| **IMDb** | No tiene API pública oficial (solo datasets/licencias comerciales). | El scraping viola sus términos. | Guardar `ttXXXXXXX` y enlazar a `imdb.com/title/ttXXXXXXX`. |
| **TheTVDB** | API de pago (suscripción). | Gratis ya no disponible; el scraping viola términos. | Guardar el ID/slug y enlazar a `thetvdb.com`. |
| **Letterboxd** | No tiene API pública. | El scraping viola sus ToS. | Guardar el slug de la película y enlazar a `letterboxd.com/film/<slug>`. |
| **JustWatch** | API B2B (de pago), sin API pública gratuita. | El scraping viola sus ToS. | Guardar el slug y enlazar a `justwatch.com`. |

> **No** se debe scrapear ninguno de estos sitios. La obtención de metadatos debe
> centralizarse en **TMDB** (primaria) y **Wikipedia/Wikidata** (respaldo), ambas con API
> legítima; los IDs externos solo sirven para enlazar saliente.

## 7. Embedding mediante oEmbed (YouTube, Vimeo, Dailymotion, Twitch, TikTok)

### 7.1. Permitido por los términos de cada plataforma

El **embedding** de players oficiales mediante oEmbed/iframe está **permitido** por los
términos de servicio de YouTube, Vimeo, Dailymotion, Twitch y TikTok. El plugin debe usar
**únicamente los players/embeds oficiales** que cada plataforma provee (oEmbed o iframe
embebible), sin reproductores de terceros.

### 7.2. Restricciones obligatorias

- ❌ **No eludir anuncios**: no bloquear ni saltar la publicidad que el reproductor oficial
  muestre.
- ❌ **No extraer el stream**: no capturar, descargar ni retransmitir el flujo de video/audio
  subyacente del embed.
- ❌ **No quitar la atribución/branding** del reproductor oficial.
- ❌ **No modificar el embed** para ocultar controles, marcas o funcionalidades de la
  plataforma.
- ✅ **Usar el embed tal cual** lo entrega la plataforma (con su player, marca y
  publicidad).

## 8. Procedimiento de retiro (notice and takedown)

1. El Operador publicará en el sitio un **contacto de notificación** para reclamos de
   propiedad intelectual (por ejemplo, **[EMAIL_CONTACTO]**).
2. Ante una notificación de infracción (DMCA/equivalente local), el Operador **retirará o
   deshabilitará** el contenido/enlace señalado en forma **expeditiva**.
3. El Operador documentará cada notificación y su resolución.

## 9. Resumen de obligaciones

| Ámbito | Obligación principal |
| ------ | -------------------- |
| Botón «ver/descargar» | Solo plataformas oficiales + archivos propios con derechos/licencia; prohibido el rip. |
| Disclaimer del botón | Mostrar el texto de la sección 3.4 junto al botón. |
| TMDB | Licencia de pago si el uso es comercial; atribución con logo + texto oficial. |
| Wikipedia/Wikidata | Atribución y enlace a la fuente (Wikipedia CC BY-SA; Wikidata CC0). |
| IMDb/TheTVDB/Letterboxd/JustWatch | Guardar ID/slug y enlazar saliente; **nunca scrapear**. |
| oEmbed (YouTube/Vimeo/Dailymotion/Twitch/TikTok) | Usar embed oficial; no eludir anuncios ni extraer stream. |

## 10. Contacto

Para notificaciones de derechos de autor, consultas sobre licencias de TMDB o sobre este
documento, escribir a **[EMAIL_CONTACTO]** o a través de **[URL]**.

---

*Plantilla adaptable. Reemplazar los placeholders y revisar con asesor legal local antes de
la publicación del plugin videoteca.*
