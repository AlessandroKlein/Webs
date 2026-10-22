import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PluginSlot } from '../../plugins/PluginSlot';
import { PageLayoutView } from '../pages/PageRenderer';
import type { PageSection } from '../pages/pageTypes';
import { useAuthStore } from '../../lib/auth-store';
import { api } from '../../lib/api';
import { SiteFooter } from '../../components/SiteFooter';
import { SiteHeader } from '../../components/SiteHeader';
import { SupportWidget } from '../../components/SupportWidget';

interface HomePage {
  slug: string;
  title: string;
  layout: PageSection[];
  redirectUrl: string | null;
}

interface SiteData {
  name: string;
  tagline: string;
  logoUrl?: string;
}

interface BlogPost {
  id: string;
  title: string;
  body: string;
  category: string | null;
  tags: string[];
  status: string;
  createdAt: string;
}

interface Product {
  id: string;
  title: string;
  description: string | null;
  price: number;
  stock: number;
  category: string | null;
  imageUrl: string | null;
  images: unknown;
}

interface Course {
  id: string;
  title: string;
  description: string | null;
  level: string | null;
  lessons: unknown[] | null;
}

interface Subscription {
  id: string;
  status: string;
  planName: string;
  endDate: string | null;
}

const asStringArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

const money = (n: number) => `$${(n / 100).toFixed(2)}`;

/** Convierte un fragmento HTML en texto plano (decodificando entidades). */
function stripHtml(html: string): string {
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim();
  } catch {
    return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }
}

/** Extrae un resumen de hasta `max` caracteres (texto plano) del cuerpo del post. */
function excerptFrom(body: string, max = 140): string {
  const looksHtml = /<\/?[a-z][\s\S]*>/i.test(body);
  const text = looksHtml ? stripHtml(body) : body.replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length <= max ? text : `${text.slice(0, max).trimEnd()}…`;
}

/** Devuelve la URL de la primera imagen del HTML del cuerpo, o `null`. */
function extractImage(html: string): string | null {
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const src = doc.querySelector('img')?.getAttribute('src');
    if (src && src.trim()) return src.trim();
  } catch {
    /* fallback por regex */
  }
  const m = /<img[^>]+src=["']([^"']+)["']/i.exec(html);
  const fallback = m?.[1]?.trim();
  return fallback || null;
}

/** Formatea una fecha ISO a un formato legible en español (Argentina). */
function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Estilo base de las tarjetas de las secciones destacadas (link o div). */
const featureCardStyle: CSSProperties = {
  textDecoration: 'none',
  color: 'inherit',
  display: 'flex',
  flexDirection: 'column',
  border: '1px solid var(--ws-border)',
  borderRadius: 'var(--ws-radius-lg)',
  background: 'var(--ws-surface)',
  overflow: 'hidden',
  boxShadow: 'var(--ws-shadow-md)',
};

/**
 * Página pública (landing) en la raíz `/`: hero con nombre + tagline + CTA
 * (distinto para visitantes vs. logueados), el contenido de la página marcada
 * como inicio (si existe), secciones destacadas (últimos artículos, productos y
 * cursos — solo si hay datos) y el pie con footer/bloques.
 */
export function PublicHome() {
  const user = useAuthStore((s) => s.user);

  const { data: page } = useQuery({
    queryKey: ['public-home'],
    queryFn: () => api.get<HomePage>('/api/v1/public/page/home'),
    retry: 0,
  });
  const { data: site } = useQuery({
    queryKey: ['public-site'],
    queryFn: () => api.get<SiteData>('/api/v1/public/site'),
    retry: 0,
  });
  const { data: posts } = useQuery({
    queryKey: ['public-blog-posts'],
    queryFn: () => api.get<BlogPost[]>('/api/v1/blocks/blog/posts?status=published'),
    retry: 0,
  });
  const { data: products } = useQuery({
    queryKey: ['public-featured-products'],
    queryFn: () => api.get<Product[]>('/api/v1/blocks/ecommerce/products/persisted'),
    retry: 0,
  });
  const { data: courses } = useQuery({
    queryKey: ['public-featured-courses'],
    queryFn: () => api.get<Course[]>('/api/v1/blocks/academia/courses'),
    retry: 0,
  });
  const { data: mySub, isLoading: mySubLoading, isError: mySubError } = useQuery({
    queryKey: ['public-my-subscription', user?.id ?? ''],
    queryFn: () => api.get<Subscription | null>(`/api/v1/blocks/suscripciones/my?userId=${user?.id ?? ''}`),
    enabled: !!user,
    retry: 0,
  });

  if (page?.redirectUrl) {
    window.location.href = page.redirectUrl;
    return null;
  }

  const siteName = site?.name ?? 'Webs';
  const tagline = site?.tagline ?? '';
  const logoUrl = site?.logoUrl;

  const latestPosts = [...(posts ?? [])]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 6);
  const featuredProducts = (products ?? []).slice(0, 4);
  const courseList = courses ?? [];
  const pageSections = page?.layout && page.layout.length > 0 ? page.layout : null;
  const showPlanCta = !!user && !mySubLoading && !mySubError && mySub === null;

  return (
    <div className="app-shell">
      <SiteHeader />

      <main style={{ flex: 1 }}>
        {/* Hero */}
        <section className="hero" style={{ padding: 'var(--ws-space-9) var(--ws-space-6)', textAlign: 'center' }}>
          {logoUrl ? (
            <img src={logoUrl} alt={siteName} style={{ height: 72, maxWidth: 280, objectFit: 'contain' }} />
          ) : (
            <span className="site-logo-mark hero-mark">
              <i className="bi bi-grid-1x2" />
            </span>
          )}
          <h1 style={{ fontSize: '2.5rem', margin: 'var(--ws-space-4) 0 var(--ws-space-2)' }}>{siteName}</h1>
          {tagline && (
            <p className="muted" style={{ fontSize: '1.15rem', maxWidth: 620, margin: '0 auto var(--ws-space-5)' }}>
              {tagline}
            </p>
          )}
          <div className="row" style={{ justifyContent: 'center', gap: 'var(--ws-space-3)', flexWrap: 'wrap' }}>
            {user ? (
              <>
                <Link to="/admin" className="btn" style={{ padding: 'var(--ws-space-3) var(--ws-space-5)' }}>
                  <i className="bi bi-speedometer2" /> Ir al panel
                </Link>
                <Link to="/blog" className="btn ghost" style={{ padding: 'var(--ws-space-3) var(--ws-space-5)' }}>
                  Explorar el blog
                </Link>
              </>
            ) : (
              <>
                <Link to="/login" className="btn" style={{ padding: 'var(--ws-space-3) var(--ws-space-5)' }}>
                  <i className="bi bi-box-arrow-in-right" /> Iniciar sesión
                </Link>
                <Link to="/store" className="btn ghost" style={{ padding: 'var(--ws-space-3) var(--ws-space-5)' }}>
                  Ver tienda
                </Link>
              </>
            )}
          </div>
        </section>

        {/* CTA: contratar un plan (solo si está logueado y sin suscripción activa) */}
        {showPlanCta && (
          <section style={{ maxWidth: 1200, margin: '0 auto', padding: '0 var(--ws-space-6) var(--ws-space-6)' }}>
            <div
              className="row"
              style={{
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 'var(--ws-space-4)',
                border: '1px solid var(--ws-border)',
                borderRadius: 'var(--ws-radius-lg)',
                background: 'var(--ws-surface)',
                padding: 'var(--ws-space-5)',
                boxShadow: 'var(--ws-shadow-md)',
              }}
            >
              <div className="stack" style={{ gap: 'var(--ws-space-2)' }}>
                <h2 style={{ margin: 0 }}>
                  <i className="bi bi-gem" style={{ color: 'var(--ws-primary)' }} /> Contratá un plan
                </h2>
                <p className="muted" style={{ margin: 0 }}>
                  Accedé a funcionalidades premium eligiendo uno de nuestros planes de suscripción.
                </p>
              </div>
              <Link to="/dashboard" className="btn" style={{ padding: 'var(--ws-space-3) var(--ws-space-5)' }}>
                Ver planes <i className="bi bi-arrow-right" />
              </Link>
            </div>
          </section>
        )}

        <div style={{ maxWidth: 1200, margin: '0 auto', padding: 'var(--ws-space-6)' }}>
          {/* Contenido de la página marcada como inicio (si existe) */}
          {pageSections && (
            <section style={{ marginBottom: 'var(--ws-space-6)' }}>
              {page?.title && <h2 style={{ marginTop: 0 }}>{page.title}</h2>}
              <PageLayoutView sections={pageSections} />
            </section>
          )}

          {/* Últimos artículos */}
          {latestPosts.length > 0 && (
            <section style={{ marginBottom: 'var(--ws-space-6)' }}>
              <div
                className="row"
                style={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--ws-space-3)', marginBottom: 'var(--ws-space-3)' }}
              >
                <h2 style={{ margin: 0 }}>Últimos artículos</h2>
                <Link to="/blog" className="btn ghost">
                  Ver blog <i className="bi bi-arrow-right" />
                </Link>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 'var(--ws-space-4)' }}>
                {latestPosts.map((p) => {
                  const image = extractImage(p.body);
                  return (
                    <Link key={p.id} to="/blog" style={featureCardStyle}>
                      <div style={{ height: 140, background: 'var(--ws-surface-2)', overflow: 'hidden' }}>
                        {image ? (
                          <img src={image} alt={p.title} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                        ) : (
                          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ws-text-muted)' }}>
                            <i className="bi bi-image" style={{ fontSize: '2rem' }} />
                          </div>
                        )}
                      </div>
                      <div style={{ padding: 'var(--ws-space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--ws-space-2)', flex: 1 }}>
                        {p.category && (
                          <span className="badge" style={{ alignSelf: 'flex-start', background: 'var(--ws-primary-soft)', color: 'var(--ws-primary)' }}>
                            {p.category}
                          </span>
                        )}
                        <strong>{p.title}</strong>
                        <span className="muted" style={{ fontSize: 'var(--ws-font-size-sm)' }}>{formatDate(p.createdAt)}</span>
                        <span className="muted" style={{ fontSize: 'var(--ws-font-size-sm)' }}>{excerptFrom(p.body, 120)}</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          )}

          {/* Productos destacados */}
          {featuredProducts.length > 0 && (
            <section style={{ marginBottom: 'var(--ws-space-6)' }}>
              <div
                className="row"
                style={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--ws-space-3)', marginBottom: 'var(--ws-space-3)' }}
              >
                <h2 style={{ margin: 0 }}>Productos destacados</h2>
                <Link to="/store" className="btn ghost">
                  Ver tienda <i className="bi bi-arrow-right" />
                </Link>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 'var(--ws-space-4)' }}>
                {featuredProducts.map((p) => {
                  const url = p.imageUrl ?? asStringArray(p.images)[0] ?? null;
                  return (
                    <Link key={p.id} to="/store" style={featureCardStyle}>
                      <div style={{ height: 150, background: 'var(--ws-surface-2)', overflow: 'hidden' }}>
                        {url ? (
                          <img src={url} alt={p.title} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                        ) : (
                          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ws-text-muted)' }}>
                            <i className="bi bi-image" style={{ fontSize: '2rem' }} />
                          </div>
                        )}
                      </div>
                      <div style={{ padding: 'var(--ws-space-3)', display: 'flex', flexDirection: 'column', gap: 'var(--ws-space-2)' }}>
                        <strong>{p.title}</strong>
                        {p.category && <span className="badge" style={{ alignSelf: 'flex-start' }}>{p.category}</span>}
                        <span style={{ fontWeight: 600 }}>{money(p.price)}</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          )}

          {/* Cursos */}
          {courseList.length > 0 && (
            <section style={{ marginBottom: 'var(--ws-space-6)' }}>
              <h2 style={{ margin: 0, marginBottom: 'var(--ws-space-3)' }}>Cursos</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 'var(--ws-space-4)' }}>
                {courseList.map((c) => (
                  <div
                    key={c.id}
                    style={{
                      border: '1px solid var(--ws-border)',
                      borderRadius: 'var(--ws-radius-lg)',
                      background: 'var(--ws-surface)',
                      padding: 'var(--ws-space-4)',
                    }}
                  >
                    <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--ws-space-2)' }}>
                      <strong>{c.title}</strong>
                      {c.level && <span className="badge">{c.level}</span>}
                    </div>
                    {c.description && <p className="muted" style={{ margin: 'var(--ws-space-2) 0 0' }}>{c.description}</p>}
                    <span className="muted" style={{ fontSize: 'var(--ws-font-size-sm)', display: 'inline-block', marginTop: 'var(--ws-space-2)' }}>
                      <i className="bi bi-journal-text" /> {(Array.isArray(c.lessons) ? c.lessons : []).length} lecciones
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        <aside style={{ padding: 'var(--ws-space-6)' }}>
          <PluginSlot slotId="sidebar" />
        </aside>
      </main>

      <footer style={{ borderTop: '1px solid var(--ws-border)' }}>
        <PluginSlot slotId="footer" />
        <SiteFooter />
        <SupportWidget />
      </footer>
    </div>
  );
}
