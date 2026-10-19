import type { JsonSchema } from '@webs/plugin-sdk';
import { uploadFile } from '../../lib/api';

/**
 * Formulario auto-generado a partir de un JSON Schema. Es la pieza que permite
 * configurar **todo desde la interfaz sin tocar código**: el backend expone el
 * esquema de cada sección de ajustes (y de cada bloque) y este componente
 * renderiza el formulario correspondiente.
 *
 * Soporta: string, number/integer, boolean, enum (select), object (anidado) y
 * widgets por `x-ui.widget` (`textarea`, `richtext`, `color`).
 */
export function SchemaForm({
  schema,
  value,
  onChange,
}: {
  schema: JsonSchema;
  value: Record<string, unknown>;
  onChange: (value: Record<string, unknown>) => void;
}) {
  const properties = schema.properties ?? {};
  const keys = Object.keys(properties);

  return (
    <div className="stack">
      {keys.map((key) => {
        const prop = properties[key];
        if (!prop) return null;
        return (
          <SchemaField
            key={key}
            name={key}
            schema={prop}
            value={value[key]}
            onChange={(v) => onChange({ ...value, [key]: v })}
          />
        );
      })}
    </div>
  );
}

function SchemaField({
  name,
  schema,
  value,
  onChange,
}: {
  name: string;
  schema: JsonSchema;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const label = schema.title ?? name;
  const widget = schema['x-ui']?.widget;

  if (schema.type === 'object' && schema.properties) {
    return (
      <fieldset
        className="stack"
        style={{
          border: '1px solid var(--ws-border)',
          borderRadius: 'var(--ws-radius-md)',
          padding: 'var(--ws-space-4)',
        }}
      >
        <legend style={{ fontWeight: 600, paddingInline: 'var(--ws-space-2)' }}>{label}</legend>
        <SchemaForm schema={schema} value={(value as Record<string, unknown>) ?? {}} onChange={onChange} />
      </fieldset>
    );
  }

  if (schema.type === 'array') {
    const items = Array.isArray(schema.items) ? schema.items[0] : schema.items;
    const options = items?.enum ?? [];
    const current = Array.isArray(value) ? value : [];
    return (
      <div className="field">
        <label>{label}</label>
        <div className="stack">
          {options.map((opt) => (
            <label key={String(opt)} className="row" style={{ gap: 'var(--ws-space-2)' }}>
              <input
                type="checkbox"
                checked={current.includes(opt)}
                onChange={(e) => {
                  const next = e.target.checked ? [...current, opt] : current.filter((v) => v !== opt);
                  onChange(next);
                }}
              />
              <span>{String(opt)}</span>
            </label>
          ))}
        </div>
      </div>
    );
  }

  if (schema.type === 'boolean') {
    return (
      <label className="row" style={{ gap: 'var(--ws-space-2)', marginBottom: 'var(--ws-space-4)' }}>
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span>{label}</span>
      </label>
    );
  }

  if (schema.enum) {
    return (
      <div className="field">
        <label>{label}</label>
        <select className="input" value={String(value ?? '')} onChange={(e) => onChange(e.target.value)}>
          <option value="">—</option>
          {schema.enum.map((opt) => (
            <option key={String(opt)} value={String(opt)}>
              {String(opt)}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (widget === 'textarea' || widget === 'richtext') {
    return (
      <div className="field">
        <label>{label}</label>
        <textarea
          className="input"
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    );
  }

  if (widget === 'image') {
    return (
      <div className="field">
        <label>{label}</label>
        <div className="row" style={{ alignItems: 'center' }}>
          <input
            className="input"
            type="url"
            value={value === undefined ? '' : String(value)}
            onChange={(e) => onChange(e.target.value)}
            placeholder="https://…"
          />
          <label className="btn secondary" style={{ cursor: 'pointer', whiteSpace: 'nowrap' }}>
            Subir imagen
            <input
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  const r = await uploadFile<{ url: string }>('/api/v1/media/upload', file);
                  onChange(r.url);
                } catch {
                  /* noop */
                }
              }}
            />
          </label>
        </div>
      </div>
    );
  }

  if (schema.type === 'number' || schema.type === 'integer') {
    return (
      <div className="field">
        <label>{label}</label>
        <input
          className="input"
          type="number"
          value={value === undefined ? '' : String(value)}
          onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
        />
      </div>
    );
  }

  const inputType = widget === 'color' ? 'color' : schema.format === 'uri' ? 'url' : 'text';
  return (
    <div className="field">
      <label>{label}</label>
      <input
        className="input"
        type={inputType}
        value={value === undefined ? '' : String(value)}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
