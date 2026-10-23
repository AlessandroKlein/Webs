import { api } from '../api';

/** Registro de datos de un recurso generado (ADR-0020). */
export interface GeneratedRecord<T = Record<string, unknown>> {
  id: string;
  resourceId: string;
  organizationId: string;
  data: T;
  createdAt: string;
  updatedAt: string;
}

/** Respuesta del endpoint `GET /generated/:resource/schema`. */
export interface GeneratedResourceSchema {
  key: string;
  schema: Record<string, unknown>;
}

/** Cliente tipado en runtime de un recurso generado. */
export type GeneratedClient<T extends object> = ReturnType<typeof createGeneratedClient<T>>;

/**
 * Crea un cliente tipado en runtime para un recurso generado (ADR-0020).
 *
 * Reusa {@link api} (`apps/web/src/lib/api.ts`): Authorization Bearer + refresh
 * automático, headers de tenant-scope y manejo de errores `ApiClientError`.
 * El tipo `T` describe el payload `data` del registro, validado contra el
 * JSON Schema del recurso por el backend.
 */
export function createGeneratedClient<T extends object>(resourceKey: string) {
  const base = `/api/v1/generated/${resourceKey}`;
  return {
    /** Lista los registros del recurso (scope del tenant activo). */
    list: () => api.get<GeneratedRecord<T>[]>(base),
    /** Obtiene un registro por id. */
    get: (id: string) => api.get<GeneratedRecord<T>>(`${base}/${id}`),
    /** Crea un registro. */
    create: (data: T) => api.post<GeneratedRecord<T>>(base, data),
    /** Actualiza un registro (parcial). */
    update: (id: string, data: Partial<T>) => api.patch<GeneratedRecord<T>>(`${base}/${id}`, data),
    /** Elimina un registro. */
    remove: (id: string) => api.del<{ ok: boolean }>(`${base}/${id}`),
    /** Obtiene el JSON Schema del recurso (para render dinámico). */
    schema: () => api.get<GeneratedResourceSchema>(`${base}/schema`),
  };
}
