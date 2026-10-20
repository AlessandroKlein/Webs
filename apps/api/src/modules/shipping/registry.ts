import type { ShippingProviderAdapter } from '@webs/plugin-sdk';

/**
 * Registro central de proveedores de envío. Cada bloque de envío registra un
 * adaptador; el bloque de ecommerce consulta las cotizaciones desde aquí.
 */
const providers = new Map<string, ShippingProviderAdapter>();

export function registerShippingProvider(adapter: ShippingProviderAdapter): void {
  providers.set(adapter.id, adapter);
}

export function getShippingProvider(id: string): ShippingProviderAdapter | undefined {
  return providers.get(id);
}

export function listShippingProviders(): Array<{ id: string; displayName: string }> {
  return [...providers.values()].map((p) => ({ id: p.id, displayName: p.displayName }));
}

export type { ShippingProviderAdapter };
