import { definePlugin, type PluginManifest } from '@webs/plugin-sdk';
import { issueArca, loginCms } from '../../../apps/api/src/integrations/arca';
import type { ArcaConfig, ArcaInvoice } from '../../../apps/api/src/integrations/arca';
import manifestJson from '../plugin.json';

const manifest = manifestJson as unknown as PluginManifest;

export default definePlugin(manifest, {
  register: async (fastify, config) => {
    const cfg = (config ?? {}) as Record<string, unknown>;

    const arcaConfig = (): ArcaConfig => ({
      environment: cfg.environment === 'produccion' ? 'produccion' : 'homologacion',
      cuit: typeof cfg.cuit === 'string' ? cfg.cuit : undefined,
      puntoVenta: typeof cfg.puntoVenta === 'string' ? cfg.puntoVenta : undefined,
      condicionFiscal: cfg.condicionFiscal === 'monotributo' ? 'monotributo' : 'responsable_inscripto',
      cert: typeof cfg.cert === 'string' ? cfg.cert : undefined,
      key: typeof cfg.key === 'string' ? cfg.key : undefined,
      alias: typeof cfg.alias === 'string' ? cfg.alias : undefined,
    });

    // Solicita CAE/CAEA ante ARCA para un comprobante. Sin credenciales o ante
    // error del webservice, devuelve un CAE simulado.
    fastify.post('/cae', async (request: unknown) => {
      const { body } = request as {
        body?: {
          amount?: number;
          customerName?: string;
          customerTaxId?: string;
          vatCondition?: string;
          type?: string;
          number?: string;
          neto?: number;
          iva?: Array<{ baseImp: number; importe: number; id: number }>;
        };
      };
      const invoice: ArcaInvoice = {
        amount: Number(body?.amount ?? 0),
        customerName: body?.customerName ?? null,
        customerTaxId: body?.customerTaxId ?? null,
        vatCondition: body?.vatCondition ?? null,
        type: body?.type,
        number: body?.number,
        neto: body?.neto != null ? Number(body.neto) : undefined,
        iva: body?.iva,
      };
      return issueArca(arcaConfig(), invoice);
    });

    // Estado de la integración ARCA: configuración + credenciales + Ticket de Acceso.
    fastify.get('/estado', async () => {
      const conf = arcaConfig();
      const hasCreds = Boolean(conf.cuit && conf.cert && conf.key);
      let ta: { generationTime: string; expirationTime: string } | null = null;
      if (hasCreds) {
        const result = await loginCms(conf);
        ta = result ? { generationTime: result.generationTime, expirationTime: result.expirationTime } : null;
      }
      return {
        configured: hasCreds,
        environment: conf.environment,
        condicionFiscal: conf.condicionFiscal,
        cuit: conf.cuit ?? null,
        puntoVenta: conf.puntoVenta ?? null,
        ta,
      };
    });
  },
});
