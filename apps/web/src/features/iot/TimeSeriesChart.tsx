import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyState } from '../../components/ui/EmptyState';
import {
  AGGREGATIONS,
  SERIES_RANGES,
  type Aggregation,
  type SeriesPoint,
  type SeriesRange,
} from './iot-api';

const VIEW_W = 800;

/**
 * Gráfico de línea SVG propio (sin CDN ni dependencias) para series temporales
 * de dispositivos IoT. Incluye, opcionalmente, selectores de métrico, rango
 * (1h/24h/7d/30d) y agregación.
 */
export function TimeSeriesChart({
  data,
  metric,
  metrics,
  onMetricChange,
  range,
  onRangeChange,
  agg,
  onAggChange,
  loading = false,
  height = 240,
  formatValue,
  emptyLabel,
  metricLabels,
  className,
}: {
  data: SeriesPoint[];
  metric?: string;
  metrics?: string[];
  /** Etiquetas legibles para las opciones del selector de métrico (i18n). */
  metricLabels?: Record<string, string>;
  onMetricChange?: (metric: string) => void;
  range?: SeriesRange;
  onRangeChange?: (range: SeriesRange) => void;
  agg?: Aggregation;
  onAggChange?: (agg: Aggregation) => void;
  loading?: boolean;
  height?: number;
  formatValue?: (value: number) => string;
  emptyLabel?: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const unit = data.find((p) => p.unit)?.unit ?? undefined;

  const hasControls = Boolean(metrics && metric && onMetricChange);

  const chart = useMemo(() => {
    const values = data
      .map((p) => p.value)
      .filter((v): v is number => typeof v === 'number');
    if (values.length === 0) return null;

    const hasBand = data.some((p) => p.min !== undefined || p.max !== undefined);
    let min = Math.min(...values);
    let max = Math.max(...values);
    if (hasBand) {
      for (const p of data) {
        if (p.min !== undefined) min = Math.min(min, p.min);
        if (p.max !== undefined) max = Math.max(max, p.max);
      }
    }
    if (min === max) {
      min -= 1;
      max += 1;
    }
    const padY = (max - min) * 0.08;
    const yMin = min - padY;
    const yMax = max + padY;

    const padX = 12;
    const innerW = VIEW_W - padX * 2;
    const innerH = height - 24;
    const x = (i: number) =>
      data.length === 1 ? VIEW_W / 2 : padX + (i * innerW) / (data.length - 1);
    const y = (v: number) => 12 + innerH - ((v - yMin) / (yMax - yMin)) * innerH;

    const line = data
      .map((p, i) => (p.value === null ? null : `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`))
      .filter(Boolean)
      .join(' ');
    const area =
      line.length > 0
        ? `${line} L${x(data.length - 1).toFixed(1)},${(12 + innerH).toFixed(1)} L${padX},${(
            12 + innerH
          ).toFixed(1)} Z`
        : '';

    const band = data
      .map((p, i) => {
        if (p.min === undefined || p.max === undefined) return null;
        const top = y(p.max).toFixed(1);
        const bottom = y(p.min).toFixed(1);
        return { x: x(i), top: Number(top), bottom: Number(bottom) };
      })
      .filter(Boolean) as { x: number; top: number; bottom: number }[];

    const fmt = formatValue ?? ((v: number) => String(Math.round(v * 100) / 100));

    return { line, area, band, y, x, yMin, yMax, innerH, fmt, max, min };
  }, [data, height, formatValue]);

  return (
    <div className={`flex flex-col gap-3 ${className ?? ''}`}>
      {hasControls && (
        <div className="flex flex-wrap items-center gap-3">
          <label className="field" style={{ minWidth: 160 }}>
            <span className="form-label">{t('iot.metric')}</span>
            <select
              className="form-select"
              value={metric}
              onChange={(e) => onMetricChange?.(e.target.value)}
            >
              {metrics!.map((m) => (
                <option key={m} value={m}>
                  {metricLabels?.[m] ?? m}
                </option>
              ))}
            </select>
          </label>
          {range && onRangeChange && (
            <SegmentedControl
              ariaLabel={t('iot.range')}
              value={range}
              onChange={(v) => onRangeChange(v as SeriesRange)}
              options={SERIES_RANGES.map((r) => ({ value: r, label: t(`iot.range.${r}`) }))}
            />
          )}
          {agg && onAggChange && (
            <label className="field" style={{ minWidth: 140 }}>
              <span className="form-label">{t('iot.aggregation')}</span>
              <select
                className="form-select"
                value={agg}
                onChange={(e) => onAggChange?.(e.target.value as Aggregation)}
              >
                {AGGREGATIONS.map((a) => (
                  <option key={a} value={a}>
                    {t(`iot.agg.${a}`)}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner label={t('common.loading')} />
        </div>
      ) : !chart ? (
        <EmptyState icon="bi-graph-up" title={emptyLabel ?? t('iot.noData')} />
      ) : (
        <div>
          <svg
            viewBox={`0 0 ${VIEW_W} ${height}`}
            width="100%"
            height={height}
            preserveAspectRatio="none"
            role="img"
            aria-label={emptyLabel ?? t('iot.series')}
            className="overflow-visible"
          >
            {[0, 1, 2, 3].map((i) => {
              const gy = 12 + (chart.innerH * i) / 3;
              return (
                <line
                  key={i}
                  x1={12}
                  x2={VIEW_W - 12}
                  y1={gy}
                  y2={gy}
                  stroke="var(--ws-border)"
                  strokeWidth={1}
                />
              );
            })}

            {chart.band.length > 0 && (
              <path
                d={chart.band
                  .map(
                    (b, i) =>
                      `${i === 0 ? 'M' : 'L'}${b.x.toFixed(1)},${b.top} L${b.x.toFixed(1)},${b.bottom}`,
                  )
                  .join(' ')}
                fill="none"
                stroke="var(--ws-primary)"
                strokeOpacity={0.35}
                strokeWidth={6}
                strokeLinecap="round"
              />
            )}

            {chart.area && (
              <path d={chart.area} fill="var(--ws-primary)" fillOpacity={0.08} />
            )}
            {chart.line && (
              <path
                d={chart.line}
                fill="none"
                stroke="var(--ws-primary)"
                strokeWidth={2}
                strokeLinejoin="round"
              />
            )}

            {data.map((p, i) =>
              p.value === null ? null : (
                <circle
                  key={i}
                  cx={chart.x(i)}
                  cy={chart.y(p.value)}
                  r={2.5}
                  fill="var(--ws-primary)"
                />
              ),
            )}
          </svg>
          <div className="flex items-center justify-between font-mono text-xs text-subtle">
            <span>
              {chart.fmt(chart.max)}
              {unit ? ` ${unit}` : ''}
            </span>
            <span>
              {chart.fmt(chart.min)}
              {unit ? ` ${unit}` : ''}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
