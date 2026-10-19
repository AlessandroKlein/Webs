import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { SiteLayout } from '../../components/SiteLayout';
import { Card } from '../../components/ui/Card';

interface Course {
  id: string;
  title: string;
  description: string | null;
  level: string | null;
  lessons: unknown[] | null;
}

interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string | null;
  type: string | null;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const date = d.toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
  const time = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  return `${date} · ${time}`;
}

/**
 * Clases (`/clases`): página pública con dos secciones — "Cursos" (academia)
 * y "Próximas clases" (eventos del calendario).
 */
export function ClassesPage() {
  const { data: courses, isLoading: coursesLoading, isError: coursesError } = useQuery({
    queryKey: ['public-academia-courses'],
    queryFn: () => api.get<Course[]>('/api/v1/blocks/academia/courses'),
    retry: 0,
  });
  const { data: events, isLoading: eventsLoading, isError: eventsError } = useQuery({
    queryKey: ['public-calendar-events'],
    queryFn: () => api.get<CalendarEvent[]>('/api/v1/blocks/calendario/events'),
    retry: 0,
  });

  return (
    <SiteLayout>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: 'var(--ws-space-6)', width: '100%' }}>
        <div
          className="row"
          style={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--ws-space-3)', marginBottom: 'var(--ws-space-4)' }}
        >
          <h1 style={{ margin: 0 }}>Clases</h1>
          <Link to="/" className="btn ghost">
            <i className="bi bi-arrow-left" /> Volver al inicio
          </Link>
        </div>

        <section style={{ marginBottom: 'var(--ws-space-6)' }}>
          <h2 style={{ fontSize: 'var(--ws-font-size-lg)' }}>Cursos</h2>
          {coursesLoading && <p className="muted">Cargando…</p>}
          {coursesError && <p className="muted">No se pudieron cargar los cursos.</p>}
          {!coursesLoading && !coursesError && (courses ?? []).length === 0 && (
            <p className="muted">Todavía no hay cursos.</p>
          )}
          <div className="stack">
            {(courses ?? []).map((c) => (
              <Card key={c.id}>
                <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--ws-space-2)' }}>
                  <strong style={{ fontSize: 'var(--ws-font-size-md)' }}>{c.title}</strong>
                  {c.level && <span className="badge">{c.level}</span>}
                </div>
                {c.description && (
                  <p className="muted" style={{ margin: 'var(--ws-space-2) 0 0' }}>
                    {c.description}
                  </p>
                )}
                <span className="muted" style={{ fontSize: 'var(--ws-font-size-sm)', display: 'inline-block', marginTop: 'var(--ws-space-2)' }}>
                  {(Array.isArray(c.lessons) ? c.lessons : []).length} lecciones
                </span>
              </Card>
            ))}
          </div>
        </section>

        <section>
          <h2 style={{ fontSize: 'var(--ws-font-size-lg)' }}>Próximas clases</h2>
          {eventsLoading && <p className="muted">Cargando…</p>}
          {eventsError && <p className="muted">No se pudieron cargar las clases.</p>}
          {!eventsLoading && !eventsError && (events ?? []).length === 0 && (
            <p className="muted">Todavía no hay clases programadas.</p>
          )}
          <div className="stack">
            {(events ?? []).map((e) => (
              <Card key={e.id}>
                <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--ws-space-2)' }}>
                  <strong>{e.title}</strong>
                  {e.type && <span className="badge">{e.type}</span>}
                </div>
                <p className="muted" style={{ margin: 'var(--ws-space-2) 0 0' }}>
                  <i className="bi bi-calendar-event" /> {formatDateTime(e.start)}
                  {e.end ? ` → ${formatDateTime(e.end)}` : ''}
                </p>
              </Card>
            ))}
          </div>
        </section>
      </div>
    </SiteLayout>
  );
}
