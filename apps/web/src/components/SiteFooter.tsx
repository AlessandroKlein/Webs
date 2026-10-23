import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';

interface FooterData {
  site: { name?: string };
  footer: {
    copyrightYear?: number;
    copyrightMode?: string;
    contactEmail?: string;
    contactPhone?: string;
    contactAddress?: string;
    legalLinks?: Array<{ label: string; url: string }>;
  };
  social: Record<string, string>;
}

/**
 * Footer del sitio: copyright (© año[s] Nombre del Sitio), datos de contacto,
 * enlaces legales y redes sociales — solo muestra los que están completos.
 */
export function SiteFooter() {
  const { t, i18n } = useTranslation();
  const { data } = useQuery({
    queryKey: ['public-footer'],
    queryFn: () => api.get<FooterData>('/api/v1/public/footer'),
    retry: 0,
  });

  const rightsText: Record<string, string> = {
    es: 'Todos los derechos reservados.',
    en: 'All rights reserved.',
    pt: 'Todos os direitos reservados.',
  };
  const rights = rightsText[i18n.language] ?? rightsText.en;

  const siteName = data?.site.name ?? 'Webs';
  const year = new Date().getFullYear();
  const startYear = data?.footer.copyrightYear ?? year;
  const range = data?.footer.copyrightMode === 'range' && startYear < year ? `${startYear}-${year}` : `${year}`;
  const social = Object.entries(data?.social ?? {}).filter(([, url]) => url);
  const legal = (data?.footer.legalLinks ?? []).filter((l) => l.label && l.url);
  const hasContact = data?.footer.contactEmail || data?.footer.contactPhone || data?.footer.contactAddress;

  // Enlaces legales nativos de la plataforma (siempre visibles).
  const builtInLegal = [
    { label: t('legal.terms'), url: '/legal/terms' },
    { label: t('legal.privacy'), url: '/legal/privacy' },
    { label: t('legal.cookies'), url: '/legal/cookies' },
    { label: t('legal.disclaimer'), url: '/legal/disclaimer' },
  ];

  // El título de la pestaña refleja el nombre del sitio.
  useEffect(() => {
    document.title = siteName;
  }, [siteName]);

  return (
    <footer className="footer">
      <div className="footer-inner">
        <span className="footer-copy">© {range} {siteName}. {rights}</span>

        {hasContact && (
          <div className="footer-contact">
            {data?.footer.contactEmail && (
              <a href={`mailto:${data.footer.contactEmail}`}>
                <i className="bi bi-envelope" /> {data.footer.contactEmail}
              </a>
            )}
            {data?.footer.contactPhone && (
              <span><i className="bi bi-telephone" /> {data.footer.contactPhone}</span>
            )}
            {data?.footer.contactAddress && (
              <span><i className="bi bi-geo-alt" /> {data.footer.contactAddress}</span>
            )}
          </div>
        )}

        <div className="footer-links">
          {builtInLegal.map((l) => (
            <Link key={l.url} to={l.url}>{l.label}</Link>
          ))}
          {legal.map((l) => (
            <a key={l.url} href={l.url} target="_blank" rel="noopener">{l.label}</a>
          ))}
          {social.map(([name, url]) => (
            <a key={name} href={url} target="_blank" rel="noopener" title={name}>
              <i className={`bi bi-${name === 'x' ? 'twitter-x' : name}`} /> {name}
            </a>
          ))}
        </div>
      </div>
    </footer>
  );
}
