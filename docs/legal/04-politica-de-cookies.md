# Política de Cookies

**Última actualización:** [FECHA]

Esta Política de Cookies explica qué son las cookies, cuáles utiliza la plataforma
**Webs** (la **«Plataforma»**), accesible en **[URL]**, y cómo podés gestionarlas.

## 1. ¿Qué son las cookies?

Las cookies son pequeños archivos de texto que se almacenan en tu dispositivo cuando
visitás un sitio web. Sirven para recordar preferencias, mantener sesiones activas y, en
algunos casos, recopilar información sobre el uso del sitio.

## 2. Cookies que utiliza la Plataforma

La Plataforma utiliza únicamente cookies **técnicas y de preferencias**, necesarias para
su funcionamiento o para recordar tus elecciones. No utiliza cookies de publicidad ni de
rastreo de terceros.

### 2.1. Cookie de sesión (necesaria)

| Cookie | Tipo | Finalidad | Atributos |
| ------ | ---- | --------- | --------- |
| Refresh token (opaco) | Sesión | Mantener la sesión iniciada de forma segura. | `HttpOnly` · `Secure` · `SameSite=Lax` · `path=/` |

- El valor es **opaco** (no legible por JavaScript) y su hash se almacena en la base de
  datos.
- La sesión se renueva de forma deslizante: **30 días** por defecto, **90 días** con la
  opción «Recordarme».
- Se elimina al cerrar sesión.

### 2.2. Cookies de preferencias (no esenciales)

| Cookie | Valor | Finalidad | Expiración |
| ------ | ----- | --------- | ---------- |
| `webs-theme` | `light` / `dark` / `system` | Recordar el tema de interfaz elegido. | 1 año |
| `webs-locale` | `es` / `en` / `pt` | Recordar el idioma elegido. | 1 año |

- Atributos: `SameSite=Lax` · `Secure` (en HTTPS) · `path=/`.
- No contienen datos personales sensibles.

## 3. Cookies de terceros

En su configuración base, la Plataforma **no instala cookies de terceros** (publicidad,
análisis o redes sociales). Si en el futuro se integrasen servicios de terceros (por
ejemplo, analítica o pasarelas de pago), esta política se actualizará y, cuando sea
exigible, se solicitará tu consentimiento previo.

## 4. Consentimiento

4.1. Las cookies **necesarias** (sesión) se instalan por ser imprescindibles para el
funcionamiento de la Plataforma.

4.2. Las cookies de **preferencias** se instalan para recordar tus elecciones. En las
jurisdicciones que lo exigen (por ejemplo, la Unión Europea conforme a la Directiva
ePrivacy/GDPR), se solicitará tu consentimiento antes de instalar cookies no esenciales,
y podrás retirarlo en cualquier momento.

## 5. Cómo gestionar o deshabilitar las cookies

Podés configurar tu navegador para bloquear, eliminar o ser avisado antes de aceptar
cookies:

- **Chrome / Edge**: Configuración → Privacidad y seguridad → Cookies.
- **Firefox**: Opciones → Privacidad y seguridad → Cookies y datos del sitio.
- **Safari**: Preferencias → Privacidad → Cookies.

Tené en cuenta que deshabilitar las cookies necesarias puede impedir iniciar sesión o
utilizar correctamente la Plataforma.

## 6. Actualizaciones de esta política

Podemos actualizar esta Política de Cookies para reflejar cambios en el uso de cookies o
en la normativa aplicable. Las modificaciones se publicarán en esta página, indicando la
fecha de última actualización.

## 7. Contacto

Para consultas sobre esta Política de Cookies, escribinos a **[EMAIL_CONTACTO]** o a
través de **[URL]**.

---

*Plantilla adaptable. Reemplazar los placeholders y revisar con asesor legal local antes
de su publicación. Detalle técnico de implementación en
[`docs/guides/cookies.md`](../guides/cookies.md).*
