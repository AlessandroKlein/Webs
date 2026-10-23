/**
 * Plantillas legales por defecto (español). Son el contenido inicial que la
 * plataforma muestra en `/legal/*` en un despliegue nuevo. Se almacenan como
 * Markdown (el administrador las edita como texto plano desde Ajustes →
 * "Páginas legales" y el frontend las renderiza a HTML).
 *
 * Fuente canónica: docs/legal/*.md (tarea t54). Los enlaces cruzados entre los
 * cuatro documentos apuntan a las rutas públicas `/legal/*`; las referencias a
 * guías del sitio de documentación se conservan como texto plano.
 */

export const LEGAL_TERMS_TEMPLATE = `# Términos y Condiciones del Servicio

**Última actualización:** [FECHA]

Estos Términos y Condiciones del Servicio (en adelante, los **«Términos»**) regulan el
acceso y uso de la plataforma **Webs** (en adelante, la **«Plataforma»**), operada por
**[NOMBRE_EMPRESA]** (en adelante, el **«Titular»** o **«Nosotros»**), con domicilio en
[DOMICILIO], inscrita en [REGISTRO_MERCANTIL], identificada fiscalmente como
[IDENTIFICACION_FISCAL].

Al acceder, registrarte o utilizar la Plataforma, disponible en **[URL]**, aceptás estos
Términos en su totalidad. Si no estás de acuerdo con ellos, no debes utilizar la
Plataforma.

## 1. Definiciones

- **«Usuario» o «Titular de cuenta»**: persona física o jurídica que crea una cuenta o
  utiliza la Plataforma.
- **«Contenido»**: toda información, texto, imagen, dato u otro material cargado o
  generado a través de la Plataforma.
- **«Plugins»**: módulos o extensiones que amplían las funcionalidades de la Plataforma,
  provistos por el Titular o por terceros.
- **«Servicio»**: el conjunto de funcionalidades ofrecidas por la Plataforma, incluyendo
  la creación y administración de sitios, plugins, gestión de contenido y demás
  prestaciones disponibles.

## 2. Aceptación y modificaciones

2.1. El uso de la Plataforma implica la aceptación plena de estos Términos y de las
políticas complementarias (Política de Privacidad, Política de Cookies y Aviso Legal).

2.2. Nos reservamos el derecho de modificar estos Términos en cualquier momento. Las
modificaciones entrarán en vigor al ser publicadas en esta página. El uso continuado de
la Plataforma tras la publicación de cambios implica la aceptación de los mismos.

## 3. Descripción del servicio

3.1. La Plataforma es una base web modular, escalable y multi-tenant que permite crear y
administrar sitios web, instalar **plugins**, gestionar contenido, organizaciones,
inventario, ventas y otras funcionalidades disponibles.

3.2. Nos esforzamos por mantener la Plataforma disponible, pero **no garantizamos** que
funcione de forma ininterrumpida o libre de errores. La Plataforma se ofrece **«tal como
está»** («as-is»), sin perjuicio de las garantías legales que resulten aplicables.

## 4. Cuentas y seguridad

4.1. Para utilizar ciertas funciones, debes crear una cuenta proporcionando información
veraz, completa y actualizada. Eres responsable de mantener la confidencialidad de tus
credenciales y de toda actividad que ocurra bajo tu cuenta.

4.2. Debes notificarnos de inmediato ante cualquier uso no autorizado de tu cuenta
escribiendo a **[EMAIL_CONTACTO]**.

4.3. Solo podrán crear cuentas y utilizar la Plataforma personas con capacidad legal para
contratar. Los menores de edad deberán contar con autorización de su representante legal.

## 5. Uso aceptable

Al utilizar la Plataforma, te comprometés a **no**:

- vulnerar leyes, reglamentos o derechos de terceros;
- cargar o distribuir contenido ilícito, difamatorio, fraudulento, discriminatorio,
  malicioso o que infrinja derechos de propiedad intelectual;
- intentar acceder sin autorización a sistemas, datos o cuentas de terceros;
- interferir o intentar desestabilizar el correcto funcionamiento de la Plataforma;
- realizar ingeniería inversa, descompilar o vulnerar las medidas técnicas de protección
  de la Plataforma o de sus componentes de licenciamiento, salvo en los límites
  permitidos por la ley aplicable;
- usar la Plataforma para el envío de correo no solicitado (spam) o para actividades que
  puedan dañar la reputación o infraestructura del Titular o de terceros.

El incumplimiento de esta sección podrá dar lugar a la suspensión o cancelación de tu
cuenta, sin perjuicio de las acciones legales que correspondan.

## 6. Contenido del usuario y propiedad intelectual

6.1. Eres el único responsable del **Contenido** que cargues o publiques. Al cargar
contenido, declarás contar con los derechos necesarios para hacerlo.

6.2. Nos otorgás una licencia limitada, no exclusiva y revocable para almacenar, procesar
y mostrar tu Contenido únicamente en la medida necesaria para prestar el Servicio.

6.3. La Plataforma, su código (en los términos de las licencias open-source aplicables),
diseño, marcas y elementos distintivos son propiedad del Titular o de sus respectivos
licenciantes y están protegidos por las leyes de propiedad intelectual e industrial.

## 7. Plugins y componentes de terceros

7.1. La Plataforma permite instalar **plugins** y componentes desarrollados por el
Titular o por terceros. Dichos componentes pueden estar sujetos a sus propios términos y
licencias.

7.2. El Titular no se hace responsable por el contenido, funcionamiento o legalidad de
plugins y componentes de terceros, salvo en los términos que establezca la normativa
aplicable.

## 8. Precios, pagos y suscripciones

8.1. Salvo que se indique lo contrario, la Plataforma puede operarse **sin un modo de
pago obligatorio**, dado que sus componentes principales son de código abierto y sin
costo (ver el anexo de cumplimiento de componentes).

8.2. Si en el futuro se habilitan planes de pago, suscripciones o comisiones por
transacciones, se publicarán previamente sus condiciones, precios y política de
reembolso, y requerirán tu aceptación expresa antes de aplicarse.

## 9. Disponibilidad y mantenimiento

Podemos suspender temporalmente el Servicio por mantenimiento, actualizaciones o
incidencias de seguridad. Procuraremos avisar con antelación cuando sea razonablemente
posible, sin que ello genere derecho a indemnización alguna, salvo disposición legal en
contrario.

## 10. Limitación de responsabilidad

10.1. En la máxima medida permitida por la ley aplicable, el Titular no será responsable
por daños indirectos, incidentales, consecuentes o por lucro cesante derivados del uso o
la imposibilidad de uso de la Plataforma.

10.2. El Titular no será responsable por: (a) la pérdida de datos o de contenido; (b)
interrupciones del servicio; (c) actos u omisiones de terceros; (d) el uso indebido de la
Plataforma por parte de los Usuarios.

10.3. Nada en estos Términos excluye o limita la responsabilidad que no pueda excluirse
por ley, ni los derechos que correspondan a los consumidores.

## 11. Indemnización

Aceptás mantener indemne al Titular, sus afiliados, directores y empleados frente a
reclamos, daños y costos (incluidos honorarios razonables de abogados) derivados de tu
uso de la Plataforma, de tu Contenido o de tu incumplimiento de estos Términos.

## 12. Suspensión y terminación

12.1. Podés dejar de usar la Plataforma en cualquier momento y solicitar la baja de tu
cuenta escribiendo a **[EMAIL_CONTACTO]**.

12.2. Podemos suspender o cancelar tu cuenta ante incumplimientos de estos Términos, por
requerimiento legal o por razones de seguridad, notificándote en la medida de lo posible.

## 13. Ley aplicable y jurisdicción

Estos Términos se regirán e interpretarán de acuerdo con las leyes de **[JURISDICCIÓN]**.
Toda controversia derivada de estos Términos se someterá a los tribunales competentes de
**[JURISDICCIÓN]**, sin perjuicio de los fueros que la normativa de defensa del
consumidor reconozca al Usuario.

## 14. Contacto

Para consultas sobre estos Términos, escribinos a **[EMAIL_CONTACTO]** o a través de
**[URL]**.

---

*Plantilla adaptable. Reemplazar los placeholders y revisar con asesor legal local antes
de su publicación.*`;

export const LEGAL_DISCLAIMER_TEMPLATE = `# Aviso Legal y Descargo de Responsabilidad

**Última actualización:** [FECHA]

## 1. Identificación del titular

En cumplimiento de las obligaciones de información, se informa que la plataforma **Webs**
(en adelante, la **«Plataforma»**), accesible en **[URL]**, es operada por:

- **Titular:** [NOMBRE_EMPRESA]
- **Domicilio:** [DOMICILIO]
- **Registro mercantil:** [REGISTRO_MERCANTIL]
- **Identificación fiscal:** [IDENTIFICACION_FISCAL]
- **Correo de contacto:** [EMAIL_CONTACTO]

## 2. Objeto

El presente Aviso Legal regula el acceso y uso de la Plataforma y pone a disposición de
los usuarios la información exigida por la normativa aplicable. El acceso a la Plataforma
atribuye la condición de usuario e implica la aceptación de este Aviso Legal, de los
[Términos del Servicio](/legal/terms), de la
[Política de Privacidad](/legal/privacy) y de la
[Política de Cookies](/legal/cookies).

## 3. Propiedad intelectual e industrial

3.1. La Plataforma, su diseño, textos, logotipos, marcas, estructura y demás elementos
distintivos son titularidad de [NOMBRE_EMPRESA] o de sus respectivos licenciantes, salvo
los componentes distribuidos bajo licencias de código abierto (ver el anexo de
cumplimiento).

3.2. Queda prohibida la reproducción, distribución, transformación o comunicación
pública de dichos elementos sin autorización previa y por escrito, salvo en los supuestos
legalmente permitidos.

## 4. Contenido de terceros y plugins

4.1. La Plataforma puede incluir o permitir la instalación de **plugins**, módulos,
enlaces o contenidos de terceros. Dichos contenidos se rigen por los términos y licencias
de sus respectivos titulares.

4.2. [NOMBRE_EMPRESA] no se hace responsable del contenido, disponibilidad, exactitud o
funcionamiento de los plugins y servicios de terceros, ni de los enlaces externos a los
que la Plataforma pueda remitir.

## 5. Descargo de responsabilidad

5.1. **Sin garantías.** La Plataforma se proporciona **«tal como está»** («as-is») y
**«según disponibilidad»** («as available»). En la máxima medida permitida por la ley,
[NOMBRE_EMPRESA] no otorga garantías, expresas o implícitas, de comerciabilidad, aptitud
para un fin particular, no infracción, exactitud, disponibilidad o ausencia de errores o
virus.

5.2. **Contenido del usuario.** Los contenidos publicados por los usuarios son de su
exclusiva responsabilidad. [NOMBRE_EMPRESA] no controla ni garantiza la veracidad,
legalidad o idoneidad de dichos contenidos.

5.3. **Disponibilidad.** [NOMBRE_EMPRESA] no garantiza la disponibilidad ininterrumpida
de la Plataforma. Podrán producirse suspensiones por mantenimiento, actualizaciones o
causas ajenas a su control.

5.4. **Decisiones basadas en la información.** La información de la Plataforma no
constituye asesoramiento profesional (legal, contable, financiero o de otra índole). El
usuario debe contrastar cualquier decisión con profesionales habilitados.

5.5. **Seguridad y datos.** Si bien se aplican medidas de seguridad razonables (ver la
[Política de Privacidad](/legal/privacy)), ninguna transmisión por Internet es totalmente
segura. El usuario es responsable de proteger sus credenciales y de realizar copias de
seguridad de su información.

## 6. Limitación de responsabilidad

En la máxima medida permitida por la ley aplicable, [NOMBRE_EMPRESA] no responderá por
daños directos, indirectos, incidentales, especiales o consecuentes, ni por lucro
cesante, derivados del uso o de la imposibilidad de uso de la Plataforma, incluidos, sin
limitación, la pérdida de datos, de beneficios o de oportunidades de negocio.

Lo anterior no excluye la responsabilidad que, por ley, no pueda limitarse, ni los
derechos reconocidos a los consumidores por la normativa aplicable en **[JURISDICCIÓN]**.

## 7. Enlaces externos

La Plataforma puede contener enlaces a sitios web de terceros. [NOMBRE_EMPRESA] no ejerce
control sobre dichos sitios y no se hace responsable de su contenido ni de sus políticas
de privacidad. El acceso a sitios de terceros se realiza bajo la exclusiva responsabilidad
del usuario.

## 8. Modificaciones

[NOMBRE_EMPRESA] se reserva el derecho de modificar, suspender o discontinuar, temporal o
definitivamente, cualquier parte de la Plataforma, así como de actualizar este Aviso
Legal. Las modificaciones entrarán en vigor al ser publicadas en esta página.

## 9. Legislación aplicable y jurisdicción

Este Aviso Legal se rige por las leyes de **[JURISDICCIÓN]**. Para cualquier controversia
derivada del mismo, las partes se someten a los tribunales competentes de
**[JURISDICCIÓN]**, sin perjuicio de los fueros que correspondan a los consumidores.

## 10. Contacto

Para cualquier consulta sobre este Aviso Legal, podés contactarnos en
**[EMAIL_CONTACTO]** o a través de **[URL]**.

---

*Plantilla adaptable. Reemplazar los placeholders y revisar con asesor legal local antes
de su publicación.*`;

export const LEGAL_PRIVACY_TEMPLATE = `# Política de Privacidad

**Última actualización:** [FECHA]

Esta Política de Privacidad describe cómo **[NOMBRE_EMPRESA]** (en adelante, el
**«Responsable»** o **«Nosotros»**) recopila, utiliza, almacena y protege los datos
personales de los usuarios de la plataforma **Webs** (la **«Plataforma»**), accesible en
**[URL]**.

Esta política ha sido redactada considerando el **Reglamento General de Protección de
Datos (GDPR — Reglamento (UE) 2016/679)** y la **Lei Geral de Proteção de Dados (LGPD —
Lei nº 13.709/2018)**, así como la normativa local que resulte aplicable en
**[JURISDICCIÓN]**.

## 1. Responsable del tratamiento

- **Responsable:** [NOMBRE_EMPRESA]
- **Domicilio:** [DOMICILIO]
- **Correo de contacto (privacidad):** [EMAIL_CONTACTO]

## 2. Datos personales que recopilamos

Según cómo utilices la Plataforma, podemos recopilar:

| Categoría | Ejemplos |
| --------- | -------- |
| **Datos de cuenta** | nombre, apellido, correo electrónico, nombre de usuario, contraseña (almacenada con hash). |
| **Datos de organización** | nombre de la organización, roles, permisos, datos de contacto. |
| **Datos de uso** | dirección IP, tipo de navegador, sistema operativo, páginas visitadas, fecha y hora de acceso. |
| **Datos de facturación** (solo si se habilitan pagos) | datos necesarios para facturar y gestionar suscripciones. |
| **Contenido del usuario** | textos, imágenes y demás contenido que cargues en la Plataforma. |
| **Datos técnicos de autenticación** | credenciales WebAuthn/passkeys, códigos OTP, en la medida en que utilices autenticación multifactor. |

## 3. Finalidades y bases legales del tratamiento

Tratamos los datos personales para las siguientes finalidades:

| Finalidad | Base legal (GDPR) | Base legal (LGPD) |
| --------- | ----------------- | ----------------- |
| Prestar el servicio y gestionar cuentas | Ejecución de contrato (Art. 6.1.b) | Ejecución de contrato (Art. 7.V) |
| Garantizar la seguridad y prevenir fraude | Interés legítimo (Art. 6.1.f) | Protección del crédito / interés legítimo (Art. 7.IX / 7.X) |
| Cumplir obligaciones legales | Obligación legal (Art. 6.1.c) | Obligación legal (Art. 7.II) |
| Enviar comunicaciones operativas del servicio | Ejecución de contrato / interés legítimo | Ejecución de contrato / interés legítimo |
| Marketing (solo con consentimiento) | Consentimiento (Art. 6.1.a) | Consentimiento (Art. 7.I) |

## 4. Cookies y tecnologías similares

Utilizamos cookies de sesión y de preferencias. Para más detalle, consultá nuestra
[Política de Cookies](/legal/cookies).

## 5. Destinatarios y transferencias internacionales

5.1. Podemos compartir datos con **proveedores de servicios** que actúan como encargados
del tratamiento (por ejemplo, infraestructura en la nube, servicios de correo, análisis),
únicamente en la medida necesaria para prestar el servicio y bajo las garantías
contractuales exigidas por la normativa aplicable.

5.2. La Plataforma está diseñada para ser **multi-tenant** y para desplegarse en
infraestructura propia o de terceros. Si los datos se transfieren a países fuera de la
jurisdicción de origen, aplicaremos las salvaguardas adecuadas (cláusulas contractuales
tipo, decisiones de adecuación u otras permitidas por la ley).

5.3. No vendemos datos personales.

## 6. Plazos de conservación

Conservamos los datos personales únicamente durante el tiempo necesario para cumplir las
finalidades descritas y, posteriormente, durante los plazos exigidos por la normativa
aplicable (por ejemplo, obligaciones fiscales o contables). Los datos de sesión y
preferencias se conservan según lo indicado en la [Política de Cookies](/legal/cookies).

## 7. Derechos de los titulares de los datos

En la medida en que la normativa aplicable lo permita, podés ejercer los siguientes
derechos escribiendo a **[EMAIL_CONTACTO]**:

- **Acceso**: conocer qué datos tratamos y obtener una copia.
- **Rectificación**: corregir datos inexactos o incompletos.
- **Supresión** («derecho al olvido»): solicitar la eliminación de tus datos.
- **Oposición**: oponerte a ciertos tratamientos (por ejemplo, marketing).
- **Limitación**: solicitar la restricción del tratamiento en ciertos supuestos.
- **Portabilidad**: recibir tus datos en un formato estructurado y de uso común.
- **Retiro del consentimiento**: revocar el consentimiento otorgado en cualquier momento.
- **No ser objeto de decisiones automatizadas** con efectos jurídicos significativos, en
  los términos de la ley.

Responderemos las solicitudes en los plazos previstos por la normativa aplicable (en
general, dentro de los plazos de GDPR/LGPD). Si considerás que el tratamiento no se ajusta
a la normativa, podés presentar una reclamación ante la autoridad de control competente:
[AUTORIDAD_CONTROL].

## 8. Seguridad

Aplicamos medidas técnicas y organizativas razonables para proteger los datos personales,
incluidas: cifrado en tránsito (HTTPS/TLS), almacenamiento de contraseñas con hash
(\`bcrypt\`), cookies de sesión con \`HttpOnly\`/\`Secure\`/\`SameSite\`, control de acceso
basado en roles (RBAC) y limitación de intentos de autenticación. Ver también
\`docs/guides/seguridad.md\`.

## 9. Menores de edad

La Plataforma no está dirigida a menores de edad sin la supervisión de un adulto
responsable. No recopilamos deliberadamente datos de menores sin el consentimiento de sus
representantes legales. Si tenés conocimiento de que un menor nos proporcionó datos,
contactanos en **[EMAIL_CONTACTO]** para proceder a su eliminación.

## 10. Modificaciones de esta política

Podemos actualizar esta Política de Privacidad para reflejar cambios legales o del
servicio. Las modificaciones se publicarán en esta página, indicando la fecha de última
actualización. Los cambios sustanciales se comunicarán por los medios disponibles.

## 11. Contacto

Para cualquier consulta sobre esta Política de Privacidad o para ejercer tus derechos,
escribinos a **[EMAIL_CONTACTO]** o a través de **[URL]**.

---

*Plantilla adaptable. Reemplazar los placeholders y revisar con asesor legal local
(DGPDP/DPO) antes de su publicación.*`;

export const LEGAL_COOKIES_TEMPLATE = `# Política de Cookies

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
| Refresh token (opaco) | Sesión | Mantener la sesión iniciada de forma segura. | \`HttpOnly\` · \`Secure\` · \`SameSite=Lax\` · \`path=/\` |

- El valor es **opaco** (no legible por JavaScript) y su hash se almacena en la base de
  datos.
- La sesión se renueva de forma deslizante: **30 días** por defecto, **90 días** con la
  opción «Recordarme».
- Se elimina al cerrar sesión.

### 2.2. Cookies de preferencias (no esenciales)

| Cookie | Valor | Finalidad | Expiración |
| ------ | ----- | --------- | ---------- |
| \`webs-theme\` | \`light\` / \`dark\` / \`system\` | Recordar el tema de interfaz elegido. | 1 año |
| \`webs-locale\` | \`es\` / \`en\` / \`pt\` | Recordar el idioma elegido. | 1 año |

- Atributos: \`SameSite=Lax\` · \`Secure\` (en HTTPS) · \`path=/\`.
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
de su publicación. Detalle técnico de implementación en \`docs/guides/cookies.md\`.*`;

/** Mapa slug de ruta pública → campo de la sección `legal` + título del documento. */
export const LEGAL_DOCUMENTS = {
  terms: { field: 'termsOfService', title: 'Términos del Servicio' },
  privacy: { field: 'privacyPolicy', title: 'Política de Privacidad' },
  cookies: { field: 'cookiePolicy', title: 'Política de Cookies' },
  disclaimer: { field: 'disclaimer', title: 'Aviso Legal' },
} as const;

export type LegalSlug = keyof typeof LEGAL_DOCUMENTS;
