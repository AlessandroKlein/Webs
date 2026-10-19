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
      title: 'Sitio (identidad)',
      properties: {
        name: { type: 'string', title: 'Nombre del sitio' },
        tagline: { type: 'string', title: 'Lema / descripción corta' },
      },
    },
    defaults: { name: 'Webs', tagline: '' },
  });

  registerSettingSection({
    key: 'branding',
    group: 'general',
    schema: {
      type: 'object',
      title: 'Imágenes y logo',
      properties: {
        logoUrl: { type: 'string', format: 'uri', title: 'URL del logo (claro)', description: 'Recomendado: 512×128 px, PNG/SVG', 'x-ui': { widget: 'image' } },
        logoDarkUrl: { type: 'string', format: 'uri', title: 'URL del logo (oscuro)', description: 'Recomendado: 512×128 px, PNG/SVG', 'x-ui': { widget: 'image' } },
        iconUrl: { type: 'string', format: 'uri', title: 'URL del icono', description: 'Recomendado: 512×512 px (app/PWA)', 'x-ui': { widget: 'image' } },
        faviconUrl: { type: 'string', format: 'uri', title: 'URL del favicon', description: 'Recomendado: 32×32 o 192×192 px', 'x-ui': { widget: 'image' } },
      },
    },
    defaults: { logoUrl: '', logoDarkUrl: '', iconUrl: '', faviconUrl: '' },
  });

  registerSettingSection({
    key: 'localization',
    group: 'general',
    schema: {
      type: 'object',
      title: 'Idioma y región',
      properties: {
        defaultLocale: { type: 'string', enum: ['es', 'en', 'pt'], title: 'Idioma por defecto' },
        timezone: {
          type: 'string',
          title: 'Zona horaria',
          default: 'America/Argentina/Buenos_Aires',
          enum: [
            'America/Argentina/Buenos_Aires', 'America/Mexico_City', 'America/Santiago', 'America/Bogota',
            'America/Lima', 'America/Caracas', 'America/Sao_Paulo', 'America/New_York', 'America/Chicago',
            'America/Denver', 'America/Los_Angeles', 'America/Toronto', 'America/Havana',
            'Europe/Madrid', 'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Rome',
            'Europe/Lisbon', 'Europe/Amsterdam', 'Europe/Moscow', 'Europe/Kyiv', 'Europe/Athens',
            'Africa/Cairo', 'Africa/Lagos', 'Africa/Johannesburg', 'Africa/Casablanca', 'Africa/Nairobi',
            'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Hong_Kong', 'Asia/Singapore', 'Asia/Seoul',
            'Asia/Bangkok', 'Asia/Jakarta', 'Asia/Kolkata', 'Asia/Dubai', 'Asia/Riyadh', 'Asia/Jerusalem',
            'Asia/Taipei', 'Asia/Manila', 'Australia/Sydney', 'Australia/Melbourne', 'Australia/Perth',
            'Pacific/Auckland', 'Pacific/Honolulu', 'UTC',
          ],
        },
        languages: {
          type: 'array',
          title: 'Idiomas habilitados',
          items: { type: 'string', enum: ['es', 'en', 'pt'] },
        },
      },
    },
    defaults: { defaultLocale: 'es', timezone: 'America/Argentina/Buenos_Aires', languages: ['es'] },
  });

  registerSettingSection({
    key: 'maintenance',
    group: 'general',
    schema: {
      type: 'object',
      title: 'Mantenimiento',
      properties: {
        maintenanceMode: { type: 'boolean', title: 'Modo mantenimiento', default: false },
      },
    },
    defaults: { maintenanceMode: false },
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
        phone: { type: 'string', title: 'Teléfono', 'x-ui': { secret: true } },
        address: { type: 'string', title: 'Dirección', 'x-ui': { secret: true } },
        whatsapp: { type: 'string', title: 'WhatsApp', 'x-ui': { secret: true } },
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

  registerSettingSection({
    key: 'smtp',
    group: 'general',
    schema: {
      type: 'object',
      title: 'Correo (SMTP)',
      properties: {
        enabled: { type: 'boolean', title: 'Habilitar envío de correos' },
        host: { type: 'string', title: 'Servidor SMTP' },
        port: { type: 'integer', title: 'Puerto', default: 587 },
        user: { type: 'string', title: 'Usuario' },
        password: { type: 'string', title: 'Contraseña', 'x-ui': { widget: 'password', secret: true } },
        from: { type: 'string', title: 'Remitente (from)' },
        secure: { type: 'boolean', title: 'Usar SSL/TLS (secure)' },
      },
    },
    defaults: { enabled: false, port: 587 },
  });

  registerSettingSection({
    key: 'security',
    group: 'general',
    schema: {
      type: 'object',
      title: 'Seguridad',
      properties: {
        hsts: { type: 'boolean', title: 'HSTS (HTTP Strict Transport Security)' },
        hstsMaxAge: { type: 'integer', title: 'HSTS max-age (segundos)', default: 15552000 },
        secureCookies: { type: 'boolean', title: 'Cookies solo por HTTPS' },
        require2FAForAdmin: {
          type: 'boolean',
          title: 'Exigir 2FA/passkey a administradores',
          description: 'Los roles super_admin y admin deben activar 2FA o una passkey para iniciar sesión.',
        },
        contentSecurityPolicy: {
          type: 'string',
          title: 'Content-Security-Policy (vacío = desactivado)',
          'x-ui': { widget: 'textarea', rows: 4 },
        },
      },
    },
    defaults: { hsts: true, hstsMaxAge: 15552000, require2FAForAdmin: false, contentSecurityPolicy: '' },
  });

  registerSettingSection({
    key: 'footer',
    group: 'general',
    schema: {
      type: 'object',
      title: 'Footer',
      properties: {
        copyrightYear: { type: 'integer', title: 'Año de creación' },
        copyrightMode: { type: 'string', enum: ['current', 'range'], title: 'Modo de copyright', default: 'range' },
        contactEmail: { type: 'string', format: 'email', title: 'Email de contacto' },
        contactPhone: { type: 'string', title: 'Teléfono de contacto' },
        contactAddress: { type: 'string', title: 'Dirección' },
        legalLinks: {
          type: 'array',
          title: 'Enlaces legales',
          items: { type: 'object', properties: { label: { type: 'string' }, url: { type: 'string', format: 'uri' } } },
        },
      },
    },
    defaults: { copyrightMode: 'range' },
  });

  // Campos personalizados del perfil de usuario (los define el administrador;
  // el usuario los completa en /account). Cada campo: key, label, type, required.
  registerSettingSection({
    key: 'userProfile',
    group: 'general',
    schema: {
      type: 'object',
      title: 'Campos del perfil de usuario',
      properties: {
        fields: {
          type: 'array',
          title: 'Campos personalizados',
          items: {
            type: 'object',
            properties: {
              key: { type: 'string', title: 'Clave (id)' },
              label: { type: 'string', title: 'Etiqueta' },
              type: { type: 'string', enum: ['text', 'date', 'number', 'select'], title: 'Tipo', default: 'text' },
              options: { type: 'string', title: 'Opciones (separadas por coma, si es select)' },
              required: { type: 'boolean', title: 'Obligatorio' },
            },
          },
        },
      },
    },
    defaults: { fields: [] },
  });

  // Pagos: umbral de auto-cancelación de transacciones pendientes.
  registerSettingSection({
    key: 'payments',
    group: 'general',
    schema: {
      type: 'object',
      title: 'Pagos',
      properties: {
        pendingExpiryMinutes: {
          type: 'integer',
          title: 'Minutos para cancelar pagos pendientes',
          description: 'Los pagos pendientes más antiguos que este umbral se eliminan automáticamente.',
          minimum: 1,
          default: 60,
        },
      },
    },
    defaults: { pendingExpiryMinutes: 60 },
  });
}
