import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from './Button';
import { TextField } from './TextField';

interface Row {
  key: string;
  value: string;
}

function toRows(record: Record<string, string>): Row[] {
  return Object.entries(record).map(([key, value]) => ({ key, value }));
}

function rowsToRecord(rows: Row[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const row of rows) {
    const key = row.key.trim();
    if (key) out[key] = row.value;
  }
  return out;
}

export interface KeyValueEditorProps {
  value: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  keyLabel: string;
  valueLabel: string;
  addLabel: string;
}

/** Editor accesible de pares clave/valor (sin tablas). Se siembra desde `value`; emite el objeto resultante. */
export function KeyValueEditor({ value, onChange, keyLabel, valueLabel, addLabel }: KeyValueEditorProps) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<Row[]>(() => toRows(value));
  const rootRef = useRef<HTMLDivElement>(null);
  // Petición de foco pendiente tras agregar/quitar una fila (TextField/Button no reenvían ref).
  const focusReq = useRef<{ kind: 'key'; row: number } | { kind: 'remove'; row: number } | null>(null);

  const update = (next: Row[]) => {
    setRows(next);
    onChange(rowsToRecord(next));
  };

  useEffect(() => {
    const req = focusReq.current;
    if (!req) return;
    focusReq.current = null;
    const root = rootRef.current;
    if (!root) return;
    if (req.kind === 'key') {
      root.querySelector<HTMLInputElement>(`[data-field="key"][data-row="${req.row}"]`)?.focus();
    } else {
      root.querySelector<HTMLButtonElement>(`[data-field="remove"][data-row="${req.row}"]`)?.focus();
    }
  }, [rows]);

  const addRow = () => {
    const idx = rows.length;
    update([...rows, { key: '', value: '' }]);
    focusReq.current = { kind: 'key', row: idx };
  };

  const removeRow = (i: number) => {
    const next = rows.filter((_, j) => j !== i);
    update(next);
    // Foco al botón "quitar" que queda en la posición `i` (antes i+1) o al anterior si era la última.
    const target = Math.min(i, next.length - 1);
    if (target >= 0) focusReq.current = { kind: 'remove', row: target };
  };

  return (
    <div ref={rootRef} className="stack" style={{ gap: 'var(--ws-space-1)' }}>
      <div className="row" style={{ gap: 'var(--ws-space-1)' }}>
        <span className="form-label" style={{ flex: 1, margin: 0 }}>{keyLabel}</span>
        <span className="form-label" style={{ flex: 1, margin: 0 }}>{valueLabel}</span>
        <span style={{ width: '2.25rem' }} aria-hidden="true" />
      </div>
      {rows.map((row, i) => (
        <div key={i} className="row" style={{ gap: 'var(--ws-space-1)' }}>
          <div style={{ flex: 1 }}>
            <TextField
              data-field="key"
              data-row={i}
              aria-label={`${keyLabel} ${i + 1}`}
              value={row.key}
              onChange={(e) => update(rows.map((r, j) => (j === i ? { ...r, key: e.target.value } : r)))}
            />
          </div>
          <div style={{ flex: 1 }}>
            <TextField
              data-field="value"
              data-row={i}
              aria-label={`${valueLabel} ${i + 1}`}
              value={row.value}
              onChange={(e) => update(rows.map((r, j) => (j === i ? { ...r, value: e.target.value } : r)))}
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            data-field="remove"
            data-row={i}
            aria-label={`${t('common.remove')} ${i + 1}`}
            onClick={() => removeRow(i)}
          >
            <i className="bi bi-x-lg" aria-hidden="true" />
          </Button>
        </div>
      ))}
      <Button type="button" variant="secondary" size="sm" onClick={addRow}>
        <i className="bi bi-plus-lg" aria-hidden="true" /> {addLabel}
      </Button>
    </div>
  );
}
