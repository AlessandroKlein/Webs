import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useAuthStore } from '../../lib/auth-store';
import { SiteLayout } from '../../components/SiteLayout';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';

const ACADEMIA = '/api/v1/blocks/academia';

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

function lessonTitle(lesson: unknown, index: number): string {
  if (lesson && typeof lesson === 'object') {
    const value = (lesson as { title?: unknown }).title;
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return `Lección ${index + 1}`;
}

/**
 * Clases (`/clases`): página pública con dos secciones — "Cursos" (academia),
 * con detalle (descripción, lecciones, nivel) e inscripción, y "Próximas
 * clases" (eventos del calendario).
 */
export function ClassesPage() {
  const user = useAuthStore((s) => s.user);

  const { data: courses, isLoading: coursesLoading, isError: coursesError } = useQuery({
    queryKey: ['public-academia-courses'],
    queryFn: () => api.get<Course[]>(`${ACADEMIA}/courses`),
    retry: 0,
  });
  const { data: events, isLoading: eventsLoading, isError: eventsError } = useQuery({
    queryKey: ['public-calendar-events'],
    queryFn: () => api.get<CalendarEvent[]>('/api/v1/blocks/calendario/events'),
    retry: 0,
  });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [student, setStudent] = useState('');

  const enroll = useMutation({
    mutationFn: (vars: { courseId: string; student: string }) =>
      api.post(`${ACADEMIA}/enrollments`, vars),
    onSuccess: () => {
      setStudent('');
    },
  });

  const openCourse = (c: Course) => {
    setSelectedId(c.id);
    setStudent(user?.email ?? user?.displayName ?? '');
    enroll.reset();
  };

  const closeCourse = () => {
    setSelectedId(null);
    enroll.reset();
  };

  const submitEnroll = (e: FormEvent) => {
    e.preventDefault();
    const courseId = selectedId;
    if (!courseId || !student.trim()) return;
    enroll.mutate({ courseId, student: student.trim() });
  };

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
            {(courses ?? []).map((c) => {
              const isOpen = selectedId === c.id;
              const courseLessons = Array.isArray(c.lessons) ? c.lessons : [];
              return (
                <Card key={c.id}>
                  <button
                    type="button"
                    onClick={() => (isOpen ? closeCourse() : openCourse(c))}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: 0,
                      textAlign: 'left',
                      width: '100%',
                      color: 'inherit',
                    }}
                  >
                    <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--ws-space-2)' }}>
                      <strong style={{ fontSize: 'var(--ws-font-size-md)' }}>{c.title}</strong>
                      <span className="row" style={{ gap: 'var(--ws-space-2)', alignItems: 'center' }}>
                        {c.level && <span className="badge">{c.level}</span>}
                        <i className={`bi bi-chevron-${isOpen ? 'up' : 'down'}`} />
                      </span>
                    </div>
                    <span
                      className="muted"
                      style={{ fontSize: 'var(--ws-font-size-sm)', display: 'inline-block', marginTop: 'var(--ws-space-2)' }}
                    >
                      {courseLessons.length} lecciones
                    </span>
                  </button>

                  {isOpen && (
                    <div
                      className="stack"
                      style={{ marginTop: 'var(--ws-space-4)', borderTop: '1px solid var(--ws-border)', paddingTop: 'var(--ws-space-4)' }}
                    >
                      {c.description && <p className="muted" style={{ margin: 0 }}>{c.description}</p>}

                      {courseLessons.length > 0 && (
                        <div>
                          <strong>Lecciones</strong>
                          <ul style={{ margin: 'var(--ws-space-2) 0 0', paddingLeft: '1.2rem' }}>
                            {courseLessons.map((l, i) => (
                              <li key={i}>{lessonTitle(l, i)}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      <form className="stack" onSubmit={submitEnroll} style={{ gap: 'var(--ws-space-2)' }}>
                        <strong>Inscribirme</strong>
                        <div className="field">
                          <label htmlFor={`student-${c.id}`}>Tu email o nombre</label>
                          <input
                            id={`student-${c.id}`}
                            className="input"
                            value={student}
                            onChange={(e) => setStudent(e.target.value)}
                            placeholder="email@ejemplo.com"
                            required
                          />
                        </div>
                        <div className="row" style={{ gap: 'var(--ws-space-2)', alignItems: 'center', flexWrap: 'wrap' }}>
                          <Button type="submit" disabled={enroll.isPending || !student.trim()}>
                            {enroll.isPending ? 'Enviando…' : 'Inscribirme'}
                          </Button>
                          {enroll.isSuccess && !enroll.isPending && (
                            <span className="muted" style={{ color: 'var(--ws-success, #16a34a)' }}>
                              ¡Inscripción enviada!
                            </span>
                          )}
                          {enroll.isError && (
                            <span className="muted" style={{ color: 'var(--ws-danger)' }}>
                              No se pudo enviar la inscripción.
                            </span>
                          )}
                        </div>
                      </form>
                    </div>
                  )}
                </Card>
              );
            })}
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
