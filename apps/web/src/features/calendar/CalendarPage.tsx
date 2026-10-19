import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { TextField } from '../../components/ui/TextField';
import { Spinner } from '../../components/ui/Spinner';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';

const CAL_BASE = '/api/v1/blocks/calendario';
const RES_BASE = '/api/v1/blocks/reservas';

interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string | null;
  type: string | null;
  createdAt: string;
}

interface Booking {
  id: string;
  serviceId: string;
  name: string;
  date: string;
  status: string;
  createdAt: string;
}

type View = 'calendar' | 'events' | 'bookings';

const STATUS_COLOR: Record<string, string> = {
  confirmed: 'var(--ws-success)',
  cancelled: 'var(--ws-danger)',
  pending: 'var(--ws-warning)',
};

function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLOR[status] ?? 'var(--ws-surface-2)';
  const isMuted = color === 'var(--ws-surface-2)';
  return (
    <span className="badge" style={{ background: color, color: isMuted ? 'var(--ws-text-muted)' : '#fff' }}>
      {status}
    </span>
  );
}

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

const pad2 = (n: number) => String(n).padStart(2, '0');

function localKey(value: string): string {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function keyToDate(key: string): Date {
  const parts = key.split('-').map(Number);
  return new Date(parts[0] ?? 2000, (parts[1] ?? 1) - 1, parts[2] ?? 1);
}

function formatDateTime(value: string): string {
  if (!value) return '—';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString('es-AR');
}

export function CalendarPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [view, setView] = useState<View>('calendar');
  const [cursor, setCursor] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  // ── Eventos ─────────────────────────────────────────────
  const { data: events, isLoading: eventsLoading } = useQuery({
    queryKey: ['calendar-events'],
    queryFn: () => api.get<CalendarEvent[]>(`${CAL_BASE}/events`),
  });

  const { data: allBookings } = useQuery({
    queryKey: ['reservas-bookings-all'],
    queryFn: () => api.get<Booking[]>(`${RES_BASE}/bookings`),
  });

  const eventsByDate: Record<string, CalendarEvent[]> = {};
  for (const ev of events ?? []) {
    const k = localKey(ev.start);
    if (!k) continue;
    const list = eventsByDate[k] ?? [];
    list.push(ev);
    eventsByDate[k] = list;
  }
  const bookingsByDate: Record<string, Booking[]> = {};
  for (const b of allBookings ?? []) {
    const k = localKey(b.date);
    if (!k) continue;
    const list = bookingsByDate[k] ?? [];
    list.push(b);
    bookingsByDate[k] = list;
  }

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
  const totalCells = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;
  const cells: Array<number | null> = [];
  for (let i = 0; i < totalCells; i++) {
    const day = i - firstWeekday + 1;
    cells.push(day >= 1 && day <= daysInMonth ? day : null);
  }
  const nowDate = new Date();
  const todayKey = `${nowDate.getFullYear()}-${pad2(nowDate.getMonth() + 1)}-${pad2(nowDate.getDate())}`;
  const rawMonthLabel = cursor.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
  const monthLabel = rawMonthLabel.charAt(0).toUpperCase() + rawMonthLabel.slice(1);
  const prevMonth = () => setCursor(new Date(year, month - 1, 1));
  const nextMonth = () => setCursor(new Date(year, month + 1, 1));
  const goToday = () => {
    const n = new Date();
    setCursor(new Date(n.getFullYear(), n.getMonth(), 1));
  };

  const [title, setTitle] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [type, setType] = useState('');
  const [confirmEvent, setConfirmEvent] = useState<CalendarEvent | null>(null);

  const createEvent = useMutation({
    mutationFn: () =>
      api.post<CalendarEvent>(`${CAL_BASE}/events`, {
        title: title.trim(),
        start: new Date(start).toISOString(),
        end: end ? new Date(end).toISOString() : undefined,
        type: type.trim() || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['calendar-events'] });
      setTitle('');
      setStart('');
      setEnd('');
      setType('');
    },
  });

  const deleteEvent = useMutation({
    mutationFn: (id: string) => api.del(`${CAL_BASE}/events/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['calendar-events'] }),
  });

  // ── Reservas ────────────────────────────────────────────
  const { data: services } = useQuery({
    queryKey: ['reservas-services'],
    queryFn: () => api.get<string[]>(`${RES_BASE}/services`),
  });

  const [dateFilter, setDateFilter] = useState('');
  const { data: bookings, isLoading: bookingsLoading } = useQuery({
    queryKey: ['reservas-bookings', dateFilter],
    queryFn: () =>
      api.get<Booking[]>(`${RES_BASE}/bookings${dateFilter ? `?date=${encodeURIComponent(dateFilter)}` : ''}`),
  });

  const [bookingServiceId, setBookingServiceId] = useState('');
  const [bookingName, setBookingName] = useState('');
  const [bookingDate, setBookingDate] = useState('');
  const [bookingStatus, setBookingStatus] = useState('');
  const [confirmBooking, setConfirmBooking] = useState<Booking | null>(null);

  const createBooking = useMutation({
    mutationFn: () =>
      api.post<Booking>(`${RES_BASE}/bookings`, {
        serviceId: bookingServiceId,
        name: bookingName.trim(),
        date: bookingDate,
        status: bookingStatus || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reservas-bookings'] });
      setBookingServiceId('');
      setBookingName('');
      setBookingDate('');
      setBookingStatus('');
    },
  });

  const updateBookingStatus = useMutation({
    mutationFn: (vars: { id: string; status: string }) =>
      api.patch(`${RES_BASE}/bookings/${vars.id}`, { status: vars.status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reservas-bookings'] }),
  });

  const deleteBooking = useMutation({
    mutationFn: (id: string) => api.del(`${RES_BASE}/bookings/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reservas-bookings'] }),
  });

  return (
    <div className="row" style={{ alignItems: 'flex-start', gap: 'var(--ws-space-6)' }}>
      <aside className="stack" style={{ minWidth: 220 }}>
        <h1 style={{ fontSize: 'var(--ws-font-size-lg)', margin: 0 }}>{t('admin.calendar.title')}</h1>
        <button
          className={`nav-link ${view === 'calendar' ? 'active' : ''}`}
          style={{ textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }}
          onClick={() => setView('calendar')}
        >
          Calendario
        </button>
        <button
          className={`nav-link ${view === 'events' ? 'active' : ''}`}
          style={{ textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }}
          onClick={() => setView('events')}
        >
          {t('admin.calendar.events')}
        </button>
        <button
          className={`nav-link ${view === 'bookings' ? 'active' : ''}`}
          style={{ textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }}
          onClick={() => setView('bookings')}
        >
          {t('admin.calendar.bookings')}
        </button>
      </aside>

      <div className="stack" style={{ flex: 1, minWidth: 0 }}>
        {view === 'calendar' && (
          <div className="stack">
            <Card>
              <div
                className="row"
                style={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--ws-space-3)' }}
              >
                <div className="row" style={{ alignItems: 'center', gap: 'var(--ws-space-2)' }}>
                  <Button variant="secondary" onClick={prevMonth} aria-label="Mes anterior">
                    <i className="bi bi-chevron-left" />
                  </Button>
                  <h2 style={{ margin: 0, minWidth: 180, textAlign: 'center' }}>{monthLabel}</h2>
                  <Button variant="secondary" onClick={nextMonth} aria-label="Mes siguiente">
                    <i className="bi bi-chevron-right" />
                  </Button>
                </div>
                <Button variant="secondary" onClick={goToday}>
                  Hoy
                </Button>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(7, 1fr)',
                  gap: 'var(--ws-space-1)',
                  marginTop: 'var(--ws-space-3)',
                }}
              >
                {WEEKDAYS.map((wd) => (
                  <div
                    key={wd}
                    style={{ textAlign: 'center', fontWeight: 600, fontSize: 'var(--ws-font-size-sm)', padding: 'var(--ws-space-1)' }}
                  >
                    {wd}
                  </div>
                ))}
                {cells.map((day, i) => {
                  if (day === null) {
                    return <div key={`blank-${i}`} style={{ minHeight: 64 }} />;
                  }
                  const key = `${year}-${pad2(month + 1)}-${pad2(day)}`;
                  const evCount = eventsByDate[key]?.length ?? 0;
                  const bkCount = bookingsByDate[key]?.length ?? 0;
                  const isSelected = selectedKey === key;
                  const isToday = key === todayKey;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSelectedKey(isSelected ? null : key)}
                      style={{
                        minHeight: 64,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'flex-start',
                        gap: 'var(--ws-space-1)',
                        padding: 'var(--ws-space-1)',
                        border: isSelected ? '2px solid var(--ws-primary)' : '1px solid var(--ws-border)',
                        borderRadius: 'var(--ws-radius-sm)',
                        background: isSelected ? 'var(--ws-primary)' : isToday ? 'var(--ws-surface-2)' : 'var(--ws-surface)',
                        color: isSelected ? '#fff' : undefined,
                        cursor: 'pointer',
                      }}
                    >
                      <span style={{ fontWeight: 600, color: isToday && !isSelected ? 'var(--ws-primary)' : undefined }}>
                        {day}
                      </span>
                      <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
                        {evCount > 0 && (
                          <span
                            title={`${evCount} evento${evCount === 1 ? '' : 's'}`}
                            style={{ width: 8, height: 8, borderRadius: '50%', background: isSelected ? '#fff' : 'var(--ws-primary)', display: 'inline-block' }}
                          />
                        )}
                        {bkCount > 0 && (
                          <span
                            title={`${bkCount} reserva${bkCount === 1 ? '' : 's'}`}
                            style={{ width: 8, height: 8, borderRadius: '50%', background: isSelected ? '#fff' : 'var(--ws-success)', display: 'inline-block' }}
                          />
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="row" style={{ gap: 'var(--ws-space-4)', marginTop: 'var(--ws-space-3)', flexWrap: 'wrap' }}>
                <span className="muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--ws-space-1)' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--ws-primary)', display: 'inline-block' }} /> Eventos
                </span>
                <span className="muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--ws-space-1)' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--ws-success)', display: 'inline-block' }} /> Reservas
                </span>
              </div>
            </Card>

            {selectedKey && (
              <Card>
                <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ margin: 0 }}>
                    {keyToDate(selectedKey).toLocaleDateString('es-AR', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </h3>
                  <Button variant="ghost" onClick={() => setSelectedKey(null)} aria-label="Cerrar">
                    <i className="bi bi-x-lg" />
                  </Button>
                </div>

                <h4 style={{ marginBottom: 'var(--ws-space-2)' }}>Eventos</h4>
                {(eventsByDate[selectedKey] ?? []).length === 0 ? (
                  <p className="muted">Sin eventos este día.</p>
                ) : (
                  <div className="stack">
                    {(eventsByDate[selectedKey] ?? []).map((ev) => (
                      <div
                        key={ev.id}
                        style={{
                          display: 'flex',
                          gap: 'var(--ws-space-2)',
                          alignItems: 'baseline',
                          flexWrap: 'wrap',
                          borderTop: '1px solid var(--ws-border)',
                          paddingTop: 'var(--ws-space-2)',
                        }}
                      >
                        <strong>{ev.title}</strong>
                        <span className="muted" style={{ fontSize: 'var(--ws-font-size-sm)' }}>
                          {formatDateTime(ev.start)}
                        </span>
                        {ev.type && <span className="badge">{ev.type}</span>}
                      </div>
                    ))}
                  </div>
                )}

                <h4 style={{ marginTop: 'var(--ws-space-4)', marginBottom: 'var(--ws-space-2)' }}>Reservas</h4>
                {(bookingsByDate[selectedKey] ?? []).length === 0 ? (
                  <p className="muted">Sin reservas este día.</p>
                ) : (
                  <div className="stack">
                    {(bookingsByDate[selectedKey] ?? []).map((b) => (
                      <div
                        key={b.id}
                        style={{
                          display: 'flex',
                          gap: 'var(--ws-space-2)',
                          alignItems: 'center',
                          flexWrap: 'wrap',
                          borderTop: '1px solid var(--ws-border)',
                          paddingTop: 'var(--ws-space-2)',
                        }}
                      >
                        <strong>{b.name}</strong>
                        <code>{b.serviceId}</code>
                        <span className="muted" style={{ fontSize: 'var(--ws-font-size-sm)' }}>
                          {formatDateTime(b.date)}
                        </span>
                        <StatusBadge status={b.status} />
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            )}
          </div>
        )}

        {view === 'events' && (
          <>
            <Card>
              <h3 style={{ marginTop: 0 }}>{t('admin.calendar.newEvent')}</h3>
              <form
                className="stack"
                onSubmit={(e) => {
                  e.preventDefault();
                  createEvent.mutate();
                }}
              >
                <div className="row" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <TextField label={t('admin.calendar.titleCol')} value={title} onChange={(e) => setTitle(e.target.value)} required />
                  <TextField label={t('admin.calendar.start')} type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} required />
                  <TextField label={t('admin.calendar.endOptional')} type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
                  <TextField label={t('admin.calendar.typeOptional')} value={type} onChange={(e) => setType(e.target.value)} placeholder={t('admin.calendar.typePlaceholder')} />
                </div>
                <div className="row">
                  <Button type="submit" disabled={createEvent.isPending || !title || !start}>
                    {t('admin.calendar.createEvent')}
                  </Button>
                  {createEvent.error && <span style={{ color: 'var(--ws-danger)' }}>{createEvent.error.message}</span>}
                </div>
              </form>
            </Card>

            <Card>
              <h3 style={{ marginTop: 0 }}>{t('admin.calendar.events')}</h3>
              {eventsLoading ? (
                <Spinner />
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>{t('admin.calendar.titleCol')}</th>
                      <th>{t('admin.calendar.start')}</th>
                      <th>{t('admin.calendar.end')}</th>
                      <th>{t('admin.calendar.type')}</th>
                      <th>{t('common.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(events ?? []).map((ev) => (
                      <tr key={ev.id}>
                        <td>{ev.title}</td>
                        <td>{new Date(ev.start).toLocaleString()}</td>
                        <td>{ev.end ? new Date(ev.end).toLocaleString() : '—'}</td>
                        <td>{ev.type ?? '—'}</td>
                        <td>
                          <Button variant="ghost" onClick={() => setConfirmEvent(ev)}>
                            {t('common.delete')}
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {(events ?? []).length === 0 && (
                      <tr>
                        <td colSpan={5}>
                          <p className="muted">{t('admin.calendar.noEvents')}</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </Card>
          </>
        )}

        {view === 'bookings' && (
          <>
            <Card>
              <h3 style={{ marginTop: 0 }}>{t('admin.calendar.newBooking')}</h3>
              <form
                className="stack"
                onSubmit={(e) => {
                  e.preventDefault();
                  createBooking.mutate();
                }}
              >
                <div className="row" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <div className="field">
                    <label>{t('admin.calendar.service')}</label>
                    <select
                      className="input"
                      value={bookingServiceId}
                      onChange={(e) => setBookingServiceId(e.target.value)}
                      required
                    >
                      <option value="">{t('admin.calendar.select')}</option>
                      {(services ?? []).map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                  <TextField label={t('common.name')} value={bookingName} onChange={(e) => setBookingName(e.target.value)} required />
                  <TextField label={t('common.date')} type="date" value={bookingDate} onChange={(e) => setBookingDate(e.target.value)} required />
                  <TextField label={t('admin.calendar.statusOptional')} value={bookingStatus} onChange={(e) => setBookingStatus(e.target.value)} placeholder="pending" />
                </div>
                <div className="row">
                  <Button type="submit" disabled={createBooking.isPending || !bookingServiceId || !bookingName || !bookingDate}>
                    {t('admin.calendar.createBooking')}
                  </Button>
                  {createBooking.error && <span style={{ color: 'var(--ws-danger)' }}>{createBooking.error.message}</span>}
                </div>
              </form>
            </Card>

            <Card>
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <h3 style={{ margin: 0 }}>{t('admin.calendar.bookings')}</h3>
                <TextField label={t('admin.calendar.filterByDate')} type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} />
              </div>
              {bookingsLoading ? (
                <Spinner />
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>{t('admin.calendar.service')}</th>
                      <th>{t('common.name')}</th>
                      <th>{t('common.date')}</th>
                      <th>{t('common.status')}</th>
                      <th>{t('common.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(bookings ?? []).map((b) => (
                      <tr key={b.id}>
                        <td>{b.serviceId}</td>
                        <td>{b.name}</td>
                        <td>{b.date}</td>
                        <td>
                          <StatusBadge status={b.status} />
                        </td>
                        <td>
                          <div className="row">
                            <Button
                              variant="secondary"
                              onClick={() => updateBookingStatus.mutate({ id: b.id, status: 'confirmed' })}
                              disabled={updateBookingStatus.isPending}
                            >
                              {t('common.confirm')}
                            </Button>
                            <Button
                              variant="ghost"
                              onClick={() => updateBookingStatus.mutate({ id: b.id, status: 'cancelled' })}
                              disabled={updateBookingStatus.isPending}
                            >
                              {t('common.cancel')}
                            </Button>
                            <Button variant="ghost" onClick={() => setConfirmBooking(b)}>
                              {t('common.delete')}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {(bookings ?? []).length === 0 && (
                      <tr>
                        <td colSpan={5}>
                          <p className="muted">{t('admin.calendar.noBookings')}</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </Card>
          </>
        )}

        <ConfirmDialog
          open={confirmEvent !== null}
          title={t('admin.calendar.deleteEvent')}
          confirmLabel={t('common.delete')}
          danger
          onConfirm={() => {
            if (confirmEvent) deleteEvent.mutate(confirmEvent.id);
            setConfirmEvent(null);
          }}
          onCancel={() => setConfirmEvent(null)}
        >
          {t('admin.calendar.deleteEventConfirm', { title: confirmEvent?.title })}
        </ConfirmDialog>

        <ConfirmDialog
          open={confirmBooking !== null}
          title={t('admin.calendar.deleteBooking')}
          confirmLabel={t('common.delete')}
          danger
          onConfirm={() => {
            if (confirmBooking) deleteBooking.mutate(confirmBooking.id);
            setConfirmBooking(null);
          }}
          onCancel={() => setConfirmBooking(null)}
        >
          {t('admin.calendar.deleteBookingConfirm', { name: confirmBooking?.name })}
        </ConfirmDialog>
      </div>
    </div>
  );
}
