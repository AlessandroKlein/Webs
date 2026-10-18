/**
 * Contrato de un proveedor de pagos (bloque). La plataforma expone un registro
 * central (`fastify.payments.register`) y endpoints genéricos de checkout y
 * webhook; cada bloque de pasarela implementa este adaptador.
 */

/** Datos de entrada de una transacción (normalizados). */
export interface PaymentProviderInput {
  /** Monto en centavos (entero, evita errores de coma flotante). */
  amount: number;
  currency: string;
  description?: string;
  /** Referencia externa del pedido (id interno de la plataforma). */
  externalReference?: string;
  /** Clave de idempotencia (evita cobros duplicados). */
  idempotencyKey?: string;
  items?: Array<{ id: string; title: string; quantity: number; unitPrice: number }>;
  metadata?: Record<string, unknown>;
}

/** Resultado de la creación de una transacción en la pasarela. */
export interface PaymentProviderResult {
  /** ID devuelto por la pasarela (transaction_id). */
  transactionId: string;
  /** URL de pago (redirección). */
  paymentUrl?: string;
  /** QR de pago (cobros presenciales / transferencias). */
  qr?: string;
  /** Respuesta cruda de la pasarela (para depuración/auditoría). */
  raw?: unknown;
}

/** Resultado de la verificación de un webhook (ya con firma validada). */
export interface PaymentWebhookResult {
  transactionId: string;
  status: 'approved' | 'rejected' | 'pending';
  raw?: unknown;
}

/** Adaptador que un bloque de pasarela registra en la plataforma. */
export interface PaymentProviderAdapter {
  /** Identificador único (ej. 'mercadopago', 'stripe'). */
  id: string;
  /** Nombre visible. */
  displayName: string;
  /** Crea una transacción (preferencia/intención de pago) en la pasarela. */
  createTransaction(input: PaymentProviderInput): Promise<PaymentProviderResult>;
  /** Verifica la firma del webhook y devuelve la transacción + estado. */
  verifyWebhook(request: unknown): Promise<PaymentWebhookResult>;
}
