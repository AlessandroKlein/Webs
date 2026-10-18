# @webs/i18n

Internacionalización base de la plataforma Webs, construida sobre [i18next](https://www.i18next.com/).

- Recursos base `es` y `en` compilados en el paquete.
- Fábrica `createI18n()` que el frontend conecta a `react-i18next`.
- Las traducciones definidas por el administrador en la UI se cargan en runtime y
  se fusionan sobre estos recursos base (ver módulo de traducciones del backend).
