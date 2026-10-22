import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '@webs/ui';
import type { PluginApiClient, PluginI18n } from '@webs/plugin-sdk';
import i18next from '../lib/i18n';
import { api } from '../lib/api';
import { getClientPlugin } from './registry';

export interface Placement {
  id: string;
  // `blockId` refleja el modelo `BlockPlacement.blockId` (sin renombrar en M1).
  blockId: string;
  slotId: string;
  order: number;
  enabled: boolean;
  config: Record<string, unknown>;
}

/**
 * Renderiza los plugins asignados a un slot (región del sitio). Obtiene las
 * colocaciones desde la API y monta cada plugin con su configuración.
 */
export function PluginSlot({ slotId }: { slotId: string }) {
  const { data: placements } = useQuery({
    queryKey: ['placements', slotId],
    queryFn: () => api.get<Placement[]>(`/api/v1/public/placements?slotId=${slotId}`),
  });

  return (
    <div className="plugin-slot" data-slot={slotId}>
      {placements
        ?.filter((p) => p.enabled)
        .sort((a, b) => a.order - b.order)
        .map((p) => (
          <PluginRenderer key={p.id} blockId={p.blockId} slot={slotId} config={p.config} />
        ))}
    </div>
  );
}

function PluginRenderer({
  blockId,
  slot,
  config,
}: {
  blockId: string;
  slot: string;
  config: Record<string, unknown>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { resolved } = useTheme();

  useEffect(() => {
    const plugin = getClientPlugin(blockId);
    const container = ref.current;
    if (!plugin || !container) return;

    const i18n: PluginI18n = {
      locale: i18next.language,
      // Por defecto resuelve en el namespace del plugin (su id).
      t: (key, options) => i18next.t(key, { ...(options ?? {}), ns: blockId }),
    };

    const cleanup = plugin.mount({
      container,
      slot,
      locale: i18next.language,
      config,
      api: api as unknown as PluginApiClient,
      i18n,
      theme: { mode: resolved, tokens: {} },
    });

    return typeof cleanup === 'function' ? cleanup : undefined;
  }, [blockId, slot, config, resolved]);

  return <div ref={ref} />;
}

/** Renderiza un plugin por su id (para el constructor de páginas). */
export function PluginById({ blockId, config = {} }: { blockId: string; config?: Record<string, unknown> }) {
  return <PluginRenderer blockId={blockId} slot="page" config={config} />;
}
