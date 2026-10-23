import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog } from '../../components/ui/Dialog';
import { Button } from '../../components/ui/Button';
import { TextField } from '../../components/ui/TextField';

export interface PermissionAreaGroup {
  area: string;
  permissions: Array<{ key: string; description: string }>;
}

export interface RoleFormValues {
  key: string;
  name: string;
  description: string;
  permissions: string[];
}

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/**
 * Formulario completo de rol (crear/editar) dentro de un `Dialog`.
 *
 * Muestra TODOS los campos (clave, nombre, descripción y permisos agrupados por
 * área, con "seleccionar todo" por área). Los roles de sistema son de solo
 * lectura en permisos y clave. El padre lo monta condicionalmente (solo cuando
 * está abierto) para que el estado se inicialice fresco en cada apertura.
 */
export function RoleFormDialog({
  title,
  initial,
  areas,
  isSystem = false,
  saving = false,
  onSave,
  onCancel,
}: {
  title: string;
  initial: RoleFormValues;
  areas: PermissionAreaGroup[];
  isSystem?: boolean;
  saving?: boolean;
  onSave: (values: RoleFormValues) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [key, setKey] = useState(initial.key);
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [permissions, setPermissions] = useState<string[]>(initial.permissions);

  const areaLabel = (area: string) => t(`roles.area.${area}`, { defaultValue: area });
  const permLabel = (key: string, description: string) =>
    t(`roles.perm.${key.replace(/\./g, '_')}`, { defaultValue: description });

  function areaKeys(area: PermissionAreaGroup): string[] {
    return area.permissions.map((p) => p.key);
  }

  function areaSelected(area: PermissionAreaGroup): boolean {
    const keys = areaKeys(area);
    return keys.length > 0 && keys.every((k) => permissions.includes(k));
  }

  function toggleArea(area: PermissionAreaGroup) {
    const keys = areaKeys(area);
    const allSelected = areaSelected(area);
    const next = new Set(permissions);
    for (const k of keys) {
      if (allSelected) next.delete(k);
      else next.add(k);
    }
    setPermissions([...next]);
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSave({ key, name, description, permissions });
  };

  return (
    <Dialog
      open
      title={title}
      onClose={onCancel}
      maxWidth={760}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} type="button">
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="role-form" disabled={saving}>
            {saving ? t('roles.saving') : t('common.save')}
          </Button>
        </>
      }
    >
      <form id="role-form" className="stack" onSubmit={onSubmit}>
        <div className="row" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="col">
            <TextField
              label={t('roles.key')}
              value={key}
              onChange={(e) => setKey(e.target.value)}
              required
              disabled={isSystem}
              placeholder="editor"
              hint={isSystem ? t('roles.keyHintSystem') : t('roles.keyHint')}
            />
          </div>
          <div className="col">
            <TextField label={t('common.name')} value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="col">
            <TextField label={t('roles.description')} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
        </div>

        <div>
          <strong>{t('roles.permissions')}</strong>
          {isSystem && <p className="muted" style={{ margin: 0 }}>{t('roles.permissionsHintSystem')}</p>}
          {areas.length === 0 ? (
            <p className="muted">{t('roles.noPermissions')}</p>
          ) : (
            <div className="stack" style={{ gap: 'var(--ws-space-4)', marginTop: 'var(--ws-space-3)' }}>
              {areas.map((area) => {
                const keys = areaKeys(area);
                return (
                  <div key={area.area} style={{ borderBottom: '1px solid var(--ws-border)', paddingBottom: 'var(--ws-space-3)' }}>
                    <label className="form-check" style={{ marginBottom: 'var(--ws-space-2)' }}>
                      <input
                        className="form-check-input"
                        type="checkbox"
                        disabled={isSystem}
                        checked={areaSelected(area)}
                        onChange={() => toggleArea(area)}
                      />
                      <span className="form-check-label">
                        <strong>{areaLabel(area.area)}</strong>
                        <span className="muted" style={{ marginLeft: 8 }}>
                          {keys.filter((k) => permissions.includes(k)).length}/{keys.length}
                        </span>
                      </span>
                    </label>
                    <div className="row" style={{ flexWrap: 'wrap', gap: '4px 24px' }}>
                      {area.permissions.map((p) => (
                        <label key={p.key} className="form-check" title={permLabel(p.key, p.description)} style={{ margin: '2px 0' }}>
                          <input
                            className="form-check-input"
                            type="checkbox"
                            disabled={isSystem}
                            checked={permissions.includes(p.key)}
                            onChange={() => setPermissions(toggle(permissions, p.key))}
                          />
                          <span className="form-check-label">
                            <code>{p.key}</code>
                            {p.description ? <span className="muted"> · {permLabel(p.key, p.description)}</span> : null}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </form>
    </Dialog>
  );
}
