import { useState } from 'react';
import type { JsonSchema } from '@webs/plugin-sdk';
import { uploadFile } from '../../lib/api';

interface HelpInfo {
  text?: string;
  url?: string;
}

function readHelp(xui: Record<string, unknown> | undefined): HelpInfo | null {
  if (!xui) return null;
  const help = xui.help;
  if (typeof help === 'string' && help.trim()) return { text: help };
  if (help && typeof help === 'object') {
    const h = help as { text?: string; url?: string };
    if (h.text || h.url) return { text: h.text, url: h.url };
  }
  return null;
}

/** Etiqueta de campo con icono "?" opcional que abre un diálogo de ayuda. */
function FieldLabel({ label, help }: { label: string; help: HelpInfo | null }) {
  const [open, setOpen] = useState(false);
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--ws-space-1)' }}>
      {label}
      {help && (
        <>
          <button
            type="button"
            onClick={() => setOpen(true)}
            title="Ayuda"
            aria-label={`Ayuda de ${label}`}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--ws-primary)',
              cursor: 'pointer',
              padding: 0,
              fontSize: '0.9em',
            }}
          >
            <i className="bi bi-question-circle" />
          </button>
          {open && (
            <div
              style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0,0,0,0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1000,
              }}
              onClick={() => setOpen(false)}
            >
              <div
                style={{
                  background: 'var(--ws-surface)',
                  border: '1px solid var(--ws-border)',
                  borderRadius: 'var(--ws-radius-lg)',
                  boxShadow: 'var(--ws-shadow-lg)',
                  padding: 'var(--ws-space-6)',
                  minWidth: 320,
                  maxWidth: 480,
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <h4 style={{ marginTop: 0 }}>{label}</h4>
                {help.text && <p style={{ margin: 0 }}>{help.text}</p>}
                {help.url && (
                  <p style={{ marginTop: 'var(--ws-space-3)' }}>
                    <a href={help.url} target="_blank" rel="noopener noreferrer">
                      <i className="bi bi-box-arrow-up-right" /> Documentación del proveedor
                    </a>
                  </p>
                )}
                <div className="row" style={{ justifyContent: 'flex-end', marginTop: 'var(--ws-space-4)' }}>
                  <button className="btn" onClick={() => setOpen(false)}>Cerrar</button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </label>
  );
}

/**
 * Formulario auto-generado a partir de un JSON Schema. Es la pieza que permite
 * configurar **todo desde la interfaz sin tocar código**: el backend expone el
 * esquema de cada sección de ajustes (y de cada plugin) y este componente
 * renderiza el formulario correspondiente.
 *
 * Soporta: string, number/integer, boolean, enum (select), object (anidado) y
 * widgets por `x-ui.widget` (`textarea`, `richtext`, `color`). Además, los
 * campos con `x-ui.help` (string o `{text, url}`) muestran un icono "?" con un
 * diálogo de ayuda (útil para campos de APIs de terceros).
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
  const help = readHelp(schema['x-ui']);
  const rows = typeof schema['x-ui']?.rows === 'number' ? (schema['x-ui']?.rows as number) : undefined;

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
        <FieldLabel label={label} help={help} />
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
        <FieldLabel label={label} help={help} />
      </label>
    );
  }

  if (schema.enum) {
    return (
      <div className="field">
        <FieldLabel label={label} help={help} />
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
        <FieldLabel label={label} help={help} />
        <textarea
          className="input"
          rows={rows}
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    );
  }

  if (widget === 'image') {
    return (
      <div className="field">
        <FieldLabel label={label} help={help} />
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
        <FieldLabel label={label} help={help} />
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
      <FieldLabel label={label} help={help} />
      <input
        className="input"
        type={inputType}
        value={value === undefined ? '' : String(value)}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
