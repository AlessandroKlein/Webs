import { useTranslation } from 'react-i18next';
import { cn } from './cn';

export function Spinner({ label, size = 'md' }: { label?: string; size?: 'sm' | 'md' | 'lg' }) {
  const { t } = useTranslation();
  const sizeClass = size === 'sm' ? 'spinner-sm' : size === 'lg' ? 'spinner-lg' : '';
  return (
    <span className="inline-flex items-center gap-2 text-muted" role="status" aria-live="polite">
      <span className={cn('spinner', sizeClass)} aria-hidden="true" />
      <span>{label ?? t('common.loading')}</span>
    </span>
  );
}
