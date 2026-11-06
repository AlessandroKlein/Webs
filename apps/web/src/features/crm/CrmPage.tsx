import { useTranslation } from 'react-i18next';
import { PageHeader } from '../../components/ui/PageHeader';
import { PluginById } from '../../plugins/PluginSlot';

/**
 * Página del panel para un plugin que aporta su propia UI (hoy CRM). El plugin
 * se monta con slot `admin`; su `clientEntry` se registra en `plugins/index.ts`.
 */
export function CrmPage() {
  const { t } = useTranslation();
  return (
    <div className="stack">
      <PageHeader
        title={t('nav.crm', { defaultValue: 'CRM' })}
        description={t('crm.description', {
          defaultValue: 'Contactos, empresas, oportunidades y actividades.',
        })}
      />
      <PluginById pluginId="crm" slot="admin" />
    </div>
  );
}
