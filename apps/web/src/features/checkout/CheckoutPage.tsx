import { useMemo, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAuthStore } from '../../lib/auth-store';
import { Button } from '../../components/ui/Button';
import { TextField } from '../../components/ui/TextField';
import { QrCode } from '../../components/ui/QrCode';
import { useCheckoutStore, type CheckoutLine } from './checkout-store';

const EC_BASE = '/api/v1/plugins/ecommerce';
const SUB_BASE = '/api/v1/plugins/suscripciones';
const PAY_BASE = '/api/v1/payments';

interface PaymentProvider {
  id: string;
  displayName: string;
}

interface CheckoutResult {
  id: string;
  transactionId: string;
  status: string;
  paymentUrl?: string | null;
  qr?: string | null;
}

interface Plan {
  id: string;
  name: string;
  price: number;
  durationDays: number;
}

interface Order {
  id: string;
  total: number;
}

interface BillingData {
  name: string;
  taxId: string;
  vatCondition: string;
}

type Method =
  | { type: 'online'; provider: string }
  | { type: 'physical'; mode: 'cash' | 'terminal' };

const money = (n: number) => `$${(n / 100).toFixed(2)}`;

const VAT_OPTIONS = [
  { value: 'Consumidor Final', labelKey: 'checkout.vatFinal' },
  { value: 'Responsable Inscripto', labelKey: 'checkout.vatRegistered' },
  { value: 'Monotributo', labelKey: 'checkout.vatMonotributo' },
  { value: 'Exento', labelKey: 'checkout.vatExempt' },
] as const;

const PROVIDER_ICONS: Record<string, string> = {
  mercadopago: 'bi-wallet2',
  stripe: 'bi-credit-card',
  paypal: 'bi-paypal',
  ebanx: 'bi-bank',
  payway: 'bi-credit-card-2-front',
  mercadolibre: 'bi-bag',
};

const providerIcon = (id: string) => PROVIDER_ICONS[id] ?? 'bi-credit-card';

// ── Estilos ──────────────────────────────────────────────────────────────

const mono = {
  fontFamily: "'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', monospace",
} as const;

const pageStyle = {
  minHeight: '100vh',
  background:
    'radial-gradient(1200px 500px at 15% -10%, var(--ws-primary-soft), transparent 60%), var(--ws-background, #0b1220)',
  padding: 'var(--ws-space-5) var(--ws-space-4)',
} as const;

const containerStyle = {
  maxWidth: 1040,
  margin: '0 auto',
  display: 'grid',
  gridTemplateColumns: '1fr',
  gap: 'var(--ws-space-5)',
  alignItems: 'start',
} as const;

const cardStyle = {
  background: 'var(--ws-surface)',
  border: '1px solid var(--ws-border)',
  borderRadius: 'var(--ws-radius-lg)',
  padding: 'var(--ws-space-5)',
} as const;

const summaryCardStyle = {
  ...cardStyle,
  position: 'sticky',
  top: 'var(--ws-space-4)',
  overflow: 'hidden',
} as const;

const summaryHeaderStyle = {
  margin: 'calc(var(--ws-space-5) * -1)',
  marginBottom: 'var(--ws-space-4)',
  padding: 'var(--ws-space-4) var(--ws-space-5)',
  background: 'linear-gradient(135deg, var(--ws-primary) 0%, var(--ws-primary-2, var(--ws-primary)) 100%)',
  color: 'var(--ws-on-primary)',
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--ws-space-3)',
} as const;

const rowBetween = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  gap: 'var(--ws-space-3)',
} as const;

const dividerStyle = {
  borderTop: '1px dashed var(--ws-border)',
  margin: 'var(--ws-space-3) 0',
} as const;

const methodBtn = (selected: boolean): CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--ws-space-3)',
  width: '100%',
  padding: 'var(--ws-space-3)',
  border: selected ? '2px solid var(--ws-primary)' : '1px solid var(--ws-border)',
  borderRadius: 'var(--ws-radius-md)',
  background: selected ? 'var(--ws-primary-soft)' : 'var(--ws-surface-2)',
  color: 'var(--ws-text)',
  cursor: 'pointer',
  textAlign: 'left',
  transition: 'border-color .15s ease, background .15s ease, transform .1s ease',
});

const errorStyle = {
  padding: 'var(--ws-space-3)',
  background: 'rgba(220, 38, 38, 0.12)',
  color: 'var(--ws-danger)',
  borderRadius: 'var(--ws-radius-md)',
  fontSize: 'var(--ws-font-size-sm)',
} as const;

// ── Componente principal ──────────────────────────────────────────────────

export function CheckoutPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const kind = params.get('kind') === 'subscription' ? 'subscription' : 'store';
  const planId = params.get('planId') ?? '';

  const user = useAuthStore((s) => s.user);
  const storeIntent = useCheckoutStore((s) => s.store);
  const clearStore = useCheckoutStore((s) => s.clearStore);

  const [billing, setBilling] = useState<BillingData>({ name: '', taxId: '', vatCondition: 'Consumidor Final' });
  const [method, setMethod] = useState<Method | null>(null);
  const [phase, setPhase] = useState<'form' | 'submitting' | 'success'>('form');
  const [result, setResult] = useState<CheckoutResult | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Proveedores online (excluye el cobro físico 'pos').
  const { data: providers } = useQuery({
    queryKey: ['checkout-providers'],
    queryFn: () => api.get<PaymentProvider[]>(`${PAY_BASE}/providers`),
    retry: 1,
  });
  const onlineProviders = useMemo(
    () => (providers ?? []).filter((p) => p.id !== 'pos'),
    [providers],
  );

  // Plan (solo para suscripciones).
  const { data: plans } = useQuery({
    queryKey: ['checkout-plans'],
    queryFn: () => api.get<Plan[]>(`${SUB_BASE}/plans`),
    enabled: kind === 'subscription',
    retry: 1,
  });
  const plan = plans?.find((p) => p.id === planId);

  const lines: CheckoutLine[] =
    kind === 'store'
      ? storeIntent?.lines ?? []
      : plan
        ? [{ id: plan.id, title: plan.name, price: plan.price, quantity: 1 }]
        : [];

  const subtotal = kind === 'store' ? (storeIntent?.subtotal ?? 0) : plan?.price ?? 0;
  const shippingCost = kind === 'store' ? (storeIntent?.shippingCost ?? 0) : 0;
  const total = subtotal + shippingCost;

  const updateBilling = (field: keyof BillingData, value: string) =>
    setBilling((prev) => ({ ...prev, [field]: value }));

  // Valida y ejecuta el pago según el kind y el método elegido.
  const confirm = async () => {
    if (!user?.id) {
      setError(t('checkout.loginRequired'));
      return;
    }
    if (kind === 'store' && (!storeIntent || storeIntent.lines.length === 0)) {
      setError(t('checkout.emptyCartError'));
      return;
    }
    if (!method) {
      setError(t('checkout.methodRequired'));
      return;
    }
    setPhase('submitting');
    setError(null);

    try {
      const customer = {
        name: billing.name.trim(),
        taxId: billing.taxId.trim(),
        vatCondition: billing.vatCondition,
      };

      if (kind === 'store') {
        // 1) Crea el pedido (el total se calcula en el backend contra precios reales).
        const order = await api.post<Order>(`${EC_BASE}/orders`, {
          items: storeIntent!.lines.map((l) => ({ id: l.id, qty: l.quantity })),
          shippingAddress: storeIntent!.shippingAddress,
          shippingMethod: storeIntent!.shippingMethod,
          shippingCost: storeIntent!.shippingCost,
        });
        setOrderId(order.id);

        const items = storeIntent!.lines.map((l) => ({
          id: l.id,
          title: l.title,
          quantity: l.quantity,
          unitPrice: l.price,
        }));
        const metadata = { kind: 'store', orderId: order.id, customer };

        if (method.type === 'physical') {
          const res = await api.post<CheckoutResult>(`${PAY_BASE}/pos`, {
            method: method.mode,
            amount: order.total,
            currency: 'ARS',
            description: t('checkout.storePaymentDescription', { id: order.id.slice(0, 8) }),
            externalReference: `order:${order.id}`,
            items,
            metadata,
          });
          setResult(res);
        } else {
          const res = await api.post<CheckoutResult>(`${PAY_BASE}/checkout`, {
            provider: method.provider,
            amount: order.total,
            currency: 'ARS',
            description: t('checkout.storePaymentDescription', { id: order.id.slice(0, 8) }),
            externalReference: `order:${order.id}`,
            items,
            metadata,
          });
          setResult(res);
        }
      } else {
        // Suscripción: el backend crea la membership pendiente y orquesta el pago.
        const res = await api.post<{
          ok: boolean;
          payment?: CheckoutResult | null;
          requirePayment?: boolean;
          error?: string;
        }>(`${SUB_BASE}/subscribe`, { userId: user.id, planId });
        if (!res.ok) {
          setError(res.error ?? t('checkout.subscriptionError'));
          setPhase('form');
          return;
        }
        if (res.requirePayment && res.payment) {
          setResult(res.payment);
        } else {
          // Plan gratuito: suscripción activa de inmediato.
          setResult({ id: '', transactionId: '', status: 'active' });
        }
      }

      // Limpia el carrito local tras crear el pedido.
      try {
        localStorage.removeItem('webs-cart');
      } catch {
        /* no-op */
      }
      clearStore();
      setPhase('success');
    } catch (e) {
      setError(e instanceof Error ? e.message : t('checkout.paymentError'));
      setPhase('form');
    }
  };

  if (phase === 'success' && result) {
    return (
      <div style={pageStyle}>
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          <SuccessCard
            result={result}
            orderId={orderId}
            total={total}
            isSubscription={kind === 'subscription'}
            onBack={() => navigate(kind === 'store' ? '/store' : '/dashboard')}
          />
        </div>
      </div>
    );
  }

  if (kind === 'store' && (!storeIntent || storeIntent.lines.length === 0)) {
    return (
      <div style={pageStyle}>
        <div style={{ maxWidth: 640, margin: '0 auto', textAlign: 'center' }} className="stack">
          <i className="bi bi-bag-x" style={{ fontSize: '2.5rem', color: 'var(--ws-text-muted)' }} />
          <h1 style={{ margin: 0 }}>{t('checkout.emptyCartTitle')}</h1>
          <p className="muted" style={{ margin: 0 }}>
            {t('checkout.emptyCartSubtitle')}
          </p>
          <div style={{ marginTop: 'var(--ws-space-2)' }}>
            <Link to="/store">
              <Button>{t('checkout.goToStore')}</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (kind === 'subscription' && plans && !plan) {
    return (
      <div style={pageStyle}>
        <div style={{ maxWidth: 640, margin: '0 auto', textAlign: 'center' }} className="stack">
          <i className="bi bi-exclamation-circle" style={{ fontSize: '2.5rem', color: 'var(--ws-text-muted)' }} />
          <h1 style={{ margin: 0 }}>{t('checkout.planNotFound')}</h1>
          <p className="muted" style={{ margin: 0 }}>
            {t('checkout.planNotFoundSubtitle')}
          </p>
          <div style={{ marginTop: 'var(--ws-space-2)' }}>
            <Link to="/dashboard">
              <Button variant="secondary">{t('common.back')}</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const title = kind === 'store' ? t('checkout.titleStore') : t('checkout.titleSubscription');

  return (
    <div style={pageStyle}>
      <div style={containerStyle}>
        {/* Columna principal: datos + método de pago */}
        <div className="stack" style={{ gap: 'var(--ws-space-4)' }}>
          <header>
            <p className="muted" style={{ margin: 0, fontSize: 'var(--ws-font-size-sm)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              {t('checkout.securePayment')}
            </p>
            <h1 style={{ margin: 'var(--ws-space-1) 0 0', fontSize: 'calc(var(--ws-font-size-lg) * 1.25)' }}>{title}</h1>
          </header>

          {/* Datos de facturación */}
          <section style={cardStyle} aria-labelledby="billing-heading">
            <h2 id="billing-heading" style={{ margin: '0 0 var(--ws-space-3)', display: 'flex', alignItems: 'center', gap: 'var(--ws-space-2)' }}>
              <i className="bi bi-receipt" aria-hidden="true" /> {t('checkout.billingData')}
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 'var(--ws-space-3)' }}>
              <TextField
                label={t('checkout.fullName')}
                value={billing.name}
                onChange={(e) => updateBilling('name', e.target.value)}
                placeholder={t('checkout.fullNamePlaceholder')}
                autoComplete="name"
              />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--ws-space-3)' }}>
                <TextField
                  label={t('checkout.taxId')}
                  value={billing.taxId}
                  onChange={(e) => updateBilling('taxId', e.target.value)}
                  placeholder={t('checkout.taxIdPlaceholder')}
                  autoComplete="off"
                />
                <div className="field">
                  <label htmlFor="vat-condition">{t('checkout.vatCondition')}</label>
                  <select
                    id="vat-condition"
                    className="input"
                    value={billing.vatCondition}
                    onChange={(e) => updateBilling('vatCondition', e.target.value)}
                  >
                    {VAT_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {t(o.labelKey)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <p className="muted" style={{ margin: 0, fontSize: 'var(--ws-font-size-sm)' }}>
                {t('checkout.billingHint')}
              </p>
            </div>
          </section>

          {/* Método de pago */}
          <section style={cardStyle} aria-labelledby="method-heading">
            <h2 id="method-heading" style={{ margin: '0 0 var(--ws-space-3)', display: 'flex', alignItems: 'center', gap: 'var(--ws-space-2)' }}>
              <i className="bi bi-credit-card" aria-hidden="true" /> {t('checkout.paymentMethod')}
            </h2>
            <div role="radiogroup" aria-label={t('checkout.paymentMethod')} className="stack" style={{ gap: 'var(--ws-space-2)' }}>
              {onlineProviders.map((p) => (
                <button
                  key={p.id}
                  role="radio"
                  aria-checked={method?.type === 'online' && method.provider === p.id}
                  style={methodBtn(method?.type === 'online' && method.provider === p.id)}
                  onClick={() => setMethod({ type: 'online', provider: p.id })}
                >
                  <i className={`bi ${providerIcon(p.id)}`} style={{ fontSize: '1.25rem', color: 'var(--ws-primary)' }} aria-hidden="true" />
                  <span style={{ flex: 1, fontWeight: 600 }}>{p.displayName}</span>
                  {method?.type === 'online' && method.provider === p.id && (
                    <i className="bi bi-check-circle-fill" style={{ color: 'var(--ws-primary)' }} aria-hidden="true" />
                  )}
                </button>
              ))}

              {kind === 'store' && (
                <>
                  <button
                    role="radio"
                    aria-checked={method?.type === 'physical' && method.mode === 'cash'}
                    style={methodBtn(method?.type === 'physical' && method.mode === 'cash')}
                    onClick={() => setMethod({ type: 'physical', mode: 'cash' })}
                  >
                    <i className="bi bi-cash-coin" style={{ fontSize: '1.25rem', color: 'var(--ws-primary)' }} aria-hidden="true" />
                    <span style={{ flex: 1 }}>
                      <strong style={{ display: 'block' }}>{t('checkout.posCash')}</strong>
                      <span className="muted" style={{ fontSize: 'var(--ws-font-size-sm)' }}>{t('checkout.posCashHint')}</span>
                    </span>
                    {method?.type === 'physical' && method.mode === 'cash' && (
                      <i className="bi bi-check-circle-fill" style={{ color: 'var(--ws-primary)' }} aria-hidden="true" />
                    )}
                  </button>
                  <button
                    role="radio"
                    aria-checked={method?.type === 'physical' && method.mode === 'terminal'}
                    style={methodBtn(method?.type === 'physical' && method.mode === 'terminal')}
                    onClick={() => setMethod({ type: 'physical', mode: 'terminal' })}
                  >
                    <i className="bi bi-credit-card-2-front" style={{ fontSize: '1.25rem', color: 'var(--ws-primary)' }} aria-hidden="true" />
                    <span style={{ flex: 1 }}>
                      <strong style={{ display: 'block' }}>{t('checkout.posTerminal')}</strong>
                      <span className="muted" style={{ fontSize: 'var(--ws-font-size-sm)' }}>{t('checkout.posTerminalHint')}</span>
                    </span>
                    {method?.type === 'physical' && method.mode === 'terminal' && (
                      <i className="bi bi-check-circle-fill" style={{ color: 'var(--ws-primary)' }} aria-hidden="true" />
                    )}
                  </button>
                </>
              )}
            </div>
          </section>

          {error && (
            <div style={errorStyle} role="alert">
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 'var(--ws-space-3)', flexWrap: 'wrap' }}>
            <Button variant="secondary" onClick={() => navigate(kind === 'store' ? '/store' : '/dashboard')} disabled={phase === 'submitting'}>
              {t('common.back')}
            </Button>
            <Button style={{ flex: 1 }} onClick={confirm} disabled={phase === 'submitting' || !method} loading={phase === 'submitting'}>
              {phase === 'submitting'
                ? t('checkout.processing')
                : t('checkout.payAmount', { amount: money(total) })}
            </Button>
          </div>
        </div>

        {/* Resumen del pedido / suscripción */}
        <aside style={summaryCardStyle} aria-label={t('checkout.summary')}>
          <div style={summaryHeaderStyle}>
            <i className="bi bi-receipt-cutoff" style={{ fontSize: '1.5rem' }} aria-hidden="true" />
            <div>
              <strong style={{ display: 'block', fontSize: 'var(--ws-font-size-sm)', textTransform: 'uppercase', letterSpacing: '0.06em', opacity: 0.85 }}>
                {kind === 'store' ? t('checkout.yourOrder') : t('checkout.yourSubscription')}
              </strong>
              <span style={{ fontSize: 'var(--ws-font-size-lg)', fontWeight: 700 }}>
                {lines.length} {kind === 'store' ? (lines.length === 1 ? t('checkout.product') : t('checkout.products')) : t('checkout.plan')}
              </span>
            </div>
          </div>

          <div className="stack" style={{ gap: 'var(--ws-space-3)' }}>
            <div className="stack" style={{ gap: 'var(--ws-space-2)' }}>
              {lines.map((l) => (
                <div key={l.id} style={rowBetween}>
                  <span style={{ display: 'flex', gap: 'var(--ws-space-2)', alignItems: 'baseline' }}>
                    <span className="muted" style={mono}>
                      {l.quantity}×
                    </span>
                    <span>{l.title}</span>
                  </span>
                  <span style={mono}>{money(l.price * l.quantity)}</span>
                </div>
              ))}
            </div>

            {kind === 'store' && storeIntent && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--ws-space-2)' }}>
                <div style={rowBetween}>
                  <span className="muted">{t('checkout.subtotal')}</span>
                  <span style={mono}>{money(subtotal)}</span>
                </div>
                <div style={rowBetween}>
                  <span className="muted">{t('checkout.shipping')}</span>
                  <span style={mono}>{shippingCost > 0 ? money(shippingCost) : '—'}</span>
                </div>
              </div>
            )}

            {kind === 'subscription' && plan && (
              <div className="stack" style={{ gap: 'var(--ws-space-1)' }}>
                <p className="muted" style={{ margin: 0 }}>
                  {t('checkout.duration', { days: plan.durationDays })}
                </p>
                <p className="muted" style={{ margin: 0 }}>
                  {t('checkout.autoRenew')}
                </p>
              </div>
            )}

            <div style={dividerStyle} />

            <div style={{ ...rowBetween, alignItems: 'center' }}>
              <strong style={{ fontSize: 'var(--ws-font-size-lg)' }}>{t('checkout.total')}</strong>
              <strong style={{ fontSize: 'calc(var(--ws-font-size-lg) * 1.2)', ...mono }}>{money(total)}</strong>
            </div>

            <p className="muted" style={{ margin: 0, fontSize: 'var(--ws-font-size-sm)', display: 'flex', gap: 'var(--ws-space-2)', alignItems: 'flex-start' }}>
              <i className="bi bi-shield-lock" aria-hidden="true" style={{ marginTop: 2 }} />
              {t('checkout.secureHint')}
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

// ── Pantalla de éxito ──────────────────────────────────────────────────────

function SuccessCard({
  result,
  orderId,
  total,
  isSubscription,
  onBack,
}: {
  result: CheckoutResult;
  orderId: string | null;
  total: number;
  isSubscription: boolean;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const approved = result.status === 'approved' || result.status === 'active';
  const needsPayment = !approved && Boolean(result.paymentUrl || result.qr);

  return (
    <div
      role="status"
      aria-live="polite"
      style={{ ...cardStyle, textAlign: 'center', padding: 'var(--ws-space-6)' }}
      className="stack"
    >
      <div
        style={{
          width: 72,
          height: 72,
          margin: '0 auto',
          borderRadius: 'var(--ws-radius-full)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: approved ? 'var(--ws-success-soft, rgba(34,197,94,.15))' : 'var(--ws-primary-soft)',
          color: approved ? 'var(--ws-success, #22c55e)' : 'var(--ws-primary)',
          fontSize: '2rem',
        }}
      >
        <i
          className={approved ? 'bi bi-check-lg' : needsPayment ? 'bi bi-credit-card' : 'bi bi-hourglass-split'}
          aria-hidden="true"
        />
      </div>

      <div>
        <h1 style={{ margin: 0 }}>{approved ? t('checkout.successTitle') : needsPayment ? t('checkout.completePaymentTitle') : t('checkout.processingTitle')}</h1>
        <p className="muted" style={{ margin: 'var(--ws-space-1) 0 0' }}>
          {approved
            ? isSubscription
              ? t('checkout.successSubscription')
              : t('checkout.successStore')
            : needsPayment
              ? t('checkout.completePaymentHint')
              : t('checkout.processingHint')}
        </p>
      </div>

      {needsPayment && result.paymentUrl && (
        <a
          href={result.paymentUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 'var(--ws-space-2)',
            padding: 'var(--ws-space-3) var(--ws-space-4)',
            background: 'var(--ws-primary)',
            color: 'var(--ws-on-primary)',
            borderRadius: 'var(--ws-radius-md)',
            textDecoration: 'none',
            fontWeight: 600,
          }}
        >
          <i className="bi bi-box-arrow-up-right" aria-hidden="true" /> {t('checkout.payNow')}
        </a>
      )}

      {needsPayment && !result.paymentUrl && result.qr && (
        <div className="stack" style={{ gap: 'var(--ws-space-2)', alignItems: 'center' }}>
          <span className="muted" style={{ fontSize: 'var(--ws-font-size-sm)' }}>
            {t('checkout.scanQr')}
          </span>
          <QrCode value={result.qr} />
        </div>
      )}

      {result.transactionId && (
        <div
          style={{
            padding: 'var(--ws-space-3)',
            background: 'var(--ws-surface-2)',
            borderRadius: 'var(--ws-radius-md)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--ws-space-1)',
          }}
        >
          {orderId && (
            <div style={rowBetween}>
              <span className="muted" style={{ fontSize: 'var(--ws-font-size-sm)' }}>
                {t('checkout.order')}
              </span>
              <code style={mono}>{orderId.slice(0, 8)}</code>
            </div>
          )}
          <div style={rowBetween}>
            <span className="muted" style={{ fontSize: 'var(--ws-font-size-sm)' }}>
              {t('checkout.transaction')}
            </span>
            <code style={mono}>{result.transactionId.slice(0, 12)}</code>
          </div>
          <div style={rowBetween}>
            <span className="muted" style={{ fontSize: 'var(--ws-font-size-sm)' }}>
              {t('checkout.total')}
            </span>
            <strong style={mono}>{money(total)}</strong>
          </div>
        </div>
      )}

      {approved && (
        <p className="muted" style={{ margin: 0, fontSize: 'var(--ws-font-size-sm)' }}>
          {t('checkout.receiptGenerated')}
        </p>
      )}

      <div style={{ display: 'flex', gap: 'var(--ws-space-3)', justifyContent: 'center', flexWrap: 'wrap' }}>
        <Link to="/account">
          <Button variant="secondary">{t('admin.account.myInvoices')}</Button>
        </Link>
        <Button onClick={onBack}>{isSubscription ? t('checkout.goToDashboard') : t('checkout.keepShopping')}</Button>
      </div>
    </div>
  );
}
