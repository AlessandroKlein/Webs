import fp from 'fastify-plugin';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { SYSTEM_VERSION } from '../modules/system';

/** Documentación OpenAPI auto-generada + Swagger UI en `/docs`. */
export default fp(async (fastify) => {
  await fastify.register(swagger, {
    openapi: {
      info: {
        title: 'Webs API',
        description: 'API REST de la plataforma Webs (modular y escalable).',
        version: SYSTEM_VERSION,
      },
      servers: [{ url: 'http://localhost:4000', description: 'Local' }],
      tags: [
        { name: 'auth', description: 'Autenticación' },
        { name: 'users', description: 'Usuarios' },
        { name: 'roles', description: 'Roles y permisos' },
        { name: 'settings', description: 'Configuración del sitio' },
        { name: 'plugins', description: 'Plugins' },
        { name: 'content', description: 'Contenido' },
        { name: 'translations', description: 'Traducciones' },
        { name: 'audit', description: 'Auditoría' },
      ],
    },
  });

  await fastify.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: { docExpansion: 'list', deepLinking: true },
  });
});
