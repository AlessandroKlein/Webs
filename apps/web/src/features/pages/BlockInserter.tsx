import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/Button';
import { elementTypeOptions, type PageElementType } from './pageTypes';

export interface BlockInserterProps {
  plugins: Array<{ pluginId: string; name?: string }>;
  onInsertElement: (type: PageElementType) => void;
  onInsertPlugin: (pluginId: string) => void;
}

/** Panel izquierdo: bloques nativos + bloques de plugins instalados. */
export function BlockInserter({ plugins, onInsertElement, onInsertPlugin }: BlockInserterProps) {
  const { t } = useTranslation();
  return (
    <aside
      className="stack"
      style={{ gap: 'var(--ws-space-3)', minWidth: 170, maxWidth: 220 }}
      aria-label={t('pages.insertBlock')}
    >
      <h3 style={{ margin: 0 }}>{t('pages.insertBlock')}</h3>
      <div className="stack" style={{ gap: 'var(--ws-space-2)' }}>
        <p className="muted" style={{ margin: 0 }}>{t('pages.nativeBlocks')}</p>
        {elementTypeOptions().map((o) => (
          <Button key={o.type} variant="secondary" size="sm" fullWidth onClick={() => onInsertElement(o.type)}>
            {o.label}
          </Button>
        ))}
      </div>
      {plugins.length > 0 && (
        <div className="stack" style={{ gap: 'var(--ws-space-2)' }}>
          <p className="muted" style={{ margin: 0 }}>{t('pages.pluginBlocks')}</p>
          {plugins.map((p) => (
            <Button key={p.pluginId} variant="secondary" size="sm" fullWidth onClick={() => onInsertPlugin(p.pluginId)}>
              {p.name || p.pluginId}
            </Button>
          ))}
        </div>
      )}
    </aside>
  );
}
