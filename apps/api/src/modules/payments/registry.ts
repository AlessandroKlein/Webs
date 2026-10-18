import type { PaymentProviderAdapter } from '@webs/plugin-sdk';

/**
 * Registro central de proveedores de pago. Cada bloque de pasarela registra un
 * adaptador; el núcleo expone los endpoints genéricos de checkout y webhook.
 */
const providers = new Map<string, PaymentProviderAdapter>();

export function registerPaymentProvider(adapter: PaymentProviderAdapter): void {
  providers.set(adapter.id, adapter);
}

export function getPaymentProvider(id: string): PaymentProviderAdapter | undefined {
  return providers.get(id);
}

export function listPaymentProviders(): Array<{ id: string; displayName: string }> {
  return [...providers.values()].map((p) => ({ id: p.id, displayName: p.displayName }));
}
