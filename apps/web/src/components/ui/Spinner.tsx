import { useTranslation } from 'react-i18next';

export function Spinner({ label }: { label?: string }) {
  const { t } = useTranslation();
  return <p className="muted">{label ?? t('common.loading')}</p>;
}
