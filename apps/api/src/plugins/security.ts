import fp from 'fastify-plugin';

export interface SecuritySettings {
  hsts?: boolean;
  hstsMaxAge?: number;
  secureCookies?: boolean;
  contentSecurityPolicy?: string;
}

/**
 * Aplica cabeceras de seguridad configurables desde la UI (sección `security`):
 *  - HSTS (solo en HTTPS).
 *  - Content-Security-Policy (opcional).
 * También expone `fastify.securitySettings` (caché de arranque) para que el
 * resto de módulos decidan, por ejemplo, si las cookies deben ser `secure`.
 */
export default fp(async (fastify) => {
  let settings: SecuritySettings = {};
  try {
    const setting = await fastify.prisma.setting.findUnique({ where: { key: 'security' } });
    settings = (setting?.value as SecuritySettings | undefined) ?? {};
  } catch {
    /* sin base de datos no se aplican cabeceras */
  }

  fastify.decorate('securitySettings', settings);

  fastify.addHook('onSend', async (request, reply) => {
    if (settings.hsts && request.protocol === 'https') {
      const maxAge = settings.hstsMaxAge ?? 15552000;
      reply.header('Strict-Transport-Security', `max-age=${maxAge}; includeSubDomains`);
    }
    if (settings.contentSecurityPolicy) {
      reply.header('Content-Security-Policy', settings.contentSecurityPolicy);
    }
  });
});
