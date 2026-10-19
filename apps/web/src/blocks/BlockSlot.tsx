import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '@webs/ui';
import type { BlockApiClient, BlockI18n } from '@webs/plugin-sdk';
import i18next from '../lib/i18n';
import { api } from '../lib/api';
import { getClientBlock } from './registry';

export interface Placement {
  id: string;
  blockId: string;
  slotId: string;
  order: number;
  enabled: boolean;
  config: Record<string, unknown>;
}

/**
 * Renderiza los bloques asignados a un slot (región del sitio). Obtiene las
 * colocaciones desde la API y monta cada bloque con su configuración.
 */
export function BlockSlot({ slotId }: { slotId: string }) {
  const { data: placements } = useQuery({
    queryKey: ['placements', slotId],
    queryFn: () => api.get<Placement[]>(`/api/v1/public/placements?slotId=${slotId}`),
  });

  return (
    <div className="block-slot" data-slot={slotId}>
      {placements
        ?.filter((p) => p.enabled)
        .sort((a, b) => a.order - b.order)
        .map((p) => (
          <BlockRenderer key={p.id} blockId={p.blockId} slot={slotId} config={p.config} />
        ))}
    </div>
  );
}

function BlockRenderer({
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
    const block = getClientBlock(blockId);
    const container = ref.current;
    if (!block || !container) return;

    const i18n: BlockI18n = {
      locale: i18next.language,
      // Por defecto resuelve en el namespace del bloque (su blockId).
      t: (key, options) => i18next.t(key, { ...(options ?? {}), ns: blockId }),
    };

    const cleanup = block.mount({
      container,
      slot,
      locale: i18next.language,
      config,
      api: api as unknown as BlockApiClient,
      i18n,
      theme: { mode: resolved, tokens: {} },
    });

    return typeof cleanup === 'function' ? cleanup : undefined;
  }, [blockId, slot, config, resolved]);

  return <div ref={ref} />;
}

/** Renderiza un bloque por su id (para el constructor de páginas). */
export function BlockById({ blockId, config = {} }: { blockId: string; config?: Record<string, unknown> }) {
  return <BlockRenderer blockId={blockId} slot="page" config={config} />;
}
