import { defineBlock, type BlockManifest } from '@webs/plugin-sdk';
import manifestJson from '../block.json';

const manifest = manifestJson as unknown as BlockManifest;

/**
 * Bloque Twilio: registra un proveedor de notificaciones (SMS/WhatsApp) en el
 * núcleo. Usa la API REST de Twilio con basic auth; el auth token se cifra en
 * reposo (x-ui.secret).
 */
export default defineBlock(manifest, {
  register: async (fastify, options) => {
    const config = options as Record<string, unknown>;

    const sendTwilio = async (to: string, message: string, channel?: string) => {
      const sid = String(config.accountSid ?? '');
      const token = String(config.authToken ?? '');
      const isWhatsApp = channel === 'whatsapp';
      const from = isWhatsApp ? String(config.whatsappFrom ?? '') : String(config.fromNumber ?? '');
      if (!sid || !token || !from) throw new Error('Twilio no configurado (accountSid/authToken/from)');

      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${btoa(`${sid}:${token}`)}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ To: to, From: from, Body: message }),
      });
      if (!res.ok) throw new Error(`Twilio HTTP ${res.status}`);
      const data = (await res.json()) as { sid?: string; status?: string };
      return { id: data.sid ?? '', status: data.status ?? 'queued' };
    };

    fastify.notifications?.register({
      id: 'twilio',
      displayName: 'Twilio',
      channels: ['sms', 'whatsapp'],
      send: async (input) => sendTwilio(input.to, input.message, input.channel),
    });
  },
});
