/**
 * Contrato de un proveedor de envío (bloque). La plataforma expone un registro
 * central (`fastify.shipping.register`) y el bloque de ecommerce consulta las
 * cotizaciones vía `fastify.shipping.get` / `fastify.shipping.list`.
 */

/** Datos de entrada de una cotización de envío (normalizados). */
export interface ShippingProviderInput {
  /** Peso en kg. */
  weight?: number;
  /** Código postal de destino (preferido para cotizar por CP). */
  postalCode?: string | null;
  /** Provincia de destino. */
  province?: string | null;
  /** Ciudad de destino. */
  city?: string | null;
  /** Dirección / código postal de destino genérico. */
  destination?: string | null;
}

/** Resultado de una cotización de envío. */
export interface ShippingQuoteResult {
  /** Costo total (moneda del proveedor, por defecto ARS). */
  cost: number;
  /** Días estimados de entrega (0 cuando no hay cotización real). */
  days: number;
  /** Moneda (ej. 'ARS'). */
  currency?: string;
}

/** Adaptador que un bloque de envío registra en la plataforma. */
export interface ShippingProviderAdapter {
  /** Identificador único (ej. 'andreani', 'oca'). */
  id: string;
  /** Nombre visible. */
  displayName: string;
  /**
   * Cotiza un envío. Devuelve `{ cost: 0, days: 0 }` cuando faltan
   * credenciales o la cotización real falla; el consumidor lo ignora y usa su
   * tarifa local.
   */
  quote(
    config: Record<string, unknown>,
    input: ShippingProviderInput,
  ): Promise<ShippingQuoteResult>;
}
