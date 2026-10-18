import { registerSettingSection } from './registry';

/**
 * Secciones de ajustes base de la plataforma. Todo lo que el administrador
 * edita desde la UI (nombre del sitio, logo, colores/CSS, SEO, políticas,
 * contacto, redes) vive aquí y se renderiza automáticamente a partir del
 * esquema JSON de cada sección.
 */
export function registerDefaultSections(): void {
  registerSettingSection({
    key: 'site',
    group: 'general',
    schema: {
      type: 'object',
      title: 'Sitio',
      properties: {
        name: { type: 'string', title: 'Nombre del sitio' },
        tagline: { type: 'string', title: 'Lema / descripción corta' },
        logoUrl: { type: 'string', format: 'uri', title: 'URL del logo' },
        faviconUrl: { type: 'string', format: 'uri', title: 'URL del favicon' },
        defaultLocale: { type: 'string', enum: ['es', 'en'], title: 'Idioma por defecto' },
      },
    },
    defaults: { name: 'Webs', tagline: '', defaultLocale: 'es' },
  });

  registerSettingSection({
    key: 'appearance',
    group: 'general',
    schema: {
      type: 'object',
      title: 'Apariencia',
      properties: {
        defaultTheme: { type: 'string', enum: ['light', 'dark', 'system'], title: 'Tema por defecto' },
        primaryColor: { type: 'string', title: 'Color primario', 'x-ui': { widget: 'color' } },
        customCss: { type: 'string', title: 'CSS personalizado', 'x-ui': { widget: 'textarea', rows: 12 } },
      },
    },
    defaults: { defaultTheme: 'system', primaryColor: '#4f46e5', customCss: '' },
  });

  registerSettingSection({
    key: 'seo',
    group: 'seo',
    schema: {
      type: 'object',
      title: 'SEO global',
      properties: {
        siteTitle: { type: 'string', title: 'Título por defecto' },
        metaDescription: { type: 'string', title: 'Descripción meta' },
        keywords: { type: 'string', title: 'Palabras clave' },
        ogImageUrl: { type: 'string', format: 'uri', title: 'Imagen Open Graph' },
        canonicalUrl: { type: 'string', format: 'uri', title: 'URL canónica' },
        robots: { type: 'string', enum: ['index,follow', 'noindex,nofollow'], title: 'Directiva robots' },
      },
    },
    defaults: { robots: 'index,follow' },
  });

  registerSettingSection({
    key: 'legal',
    group: 'general',
    schema: {
      type: 'object',
      title: 'Páginas legales',
      properties: {
        privacyPolicy: { type: 'string', title: 'Política de privacidad', 'x-ui': { widget: 'richtext' } },
        termsOfService: { type: 'string', title: 'Términos de uso', 'x-ui': { widget: 'richtext' } },
        cookiePolicy: { type: 'string', title: 'Política de cookies', 'x-ui': { widget: 'richtext' } },
      },
    },
    defaults: {},
  });

  registerSettingSection({
    key: 'contact',
    group: 'general',
    schema: {
      type: 'object',
      title: 'Contacto',
      properties: {
        email: { type: 'string', format: 'email', title: 'Correo de contacto' },
        phone: { type: 'string', title: 'Teléfono' },
        address: { type: 'string', title: 'Dirección' },
        whatsapp: { type: 'string', title: 'WhatsApp' },
      },
    },
    defaults: {},
  });

  registerSettingSection({
    key: 'social',
    group: 'general',
    schema: {
      type: 'object',
      title: 'Redes sociales',
      properties: {
        facebook: { type: 'string', format: 'uri' },
        instagram: { type: 'string', format: 'uri' },
        x: { type: 'string', format: 'uri' },
        linkedin: { type: 'string', format: 'uri' },
        youtube: { type: 'string', format: 'uri' },
      },
    },
    defaults: {},
  });
}
