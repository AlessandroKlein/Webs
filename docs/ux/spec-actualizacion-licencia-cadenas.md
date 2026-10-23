# Diseño UX/UI — Actualización, licencia y gestión de cadenas (M2)

> Alcance t24. Documento de spec visual + componentes reutilizables para tres
> superficies del Milestone 2: (1) flujo de actualización, (2) pantalla de
> activación de licencia y (3) gestión de cadenas. Sigue `ui-ux-governance` y
> mantiene los tokens y convenciones de t4/uxui.

## 1. Contexto y objetivos

La base de componentes de t4 quedó en `apps/web/src/components/ui/` (Button,
Card, Badge, Progress, Alert, Tabs, StepIndicator, BarcodeScanner, etc.) sobre
tokens `--ws-*` + Tailwind `@theme`, **sin** Shadcn/Radix. Estas tres superficies
del M2 no tienen aún UI definida; se diseñan ahora como **componentes
presentacionales** que la fase de frontend cableará a su lógica (backend queda
fuera del alcance de este documento).

Objetivos:

1. Entregar primitivas reutilizables para las tres superficies, coherentes con el
   catálogo de t4 (mismo idioma visual, mismos tokens, misma firma composable).
2. Reducir el **esfuerzo total del usuario**: estados claros antes/durante/después
   de actualizar, activación de licencia sin ambigüedad y gestión de cadenas con
   alcance explícito (HQ vs sucursal).
3. Cubrir **estados de interacción** (buscando/descargando/instalando/éxito/error/
   rollback, licenciado/trial/vencida, habilitado/deshabilitado) y **recuperación**
   (reintentar, restaurar versión, copiar fingerprint).

## 2. Decisiones de arquitectura UI

| Decisión | Fundamento |
|---|---|
| **Componentes en `apps/web/src/components/ui/`.** | Mismo lugar que t4; mínimo riesgo y consistencia de imports directos (`import { X } from '../components/ui/X'`). |
| **Sin lógica de backend.** | Los componentes reciben datos por props y exponen callbacks (`onChange`, `onSubmit`, `action`). La orquestación de red/estado la cablea frontend. |
| **Todo el styling consume tokens `--ws-*`.** | Regla dura del sistema (`packages/ui/src/styles/tokens.css`). Sin colores fijos. |
| **Reutilizar, no duplicar.** | Se compone sobre `Badge`, `Progress`, `Alert`, `Button`, `Input`, `Label`, `cn`. `SegmentedControl` es la única primitiva nueva de selección (semántica `radiogroup`, distinta de `Tabs`/`tablist`). |
| **Sin tokens nuevos.** | t24 reutiliza los tokens de t4 (semánticos + `-soft`). No se agregan variables. |

## 3. Catálogo de componentes nuevos

Ubicación: `apps/web/src/components/ui/`. Todos consumen tokens y son compatibles
con React 19 (`ref` como prop común; `import type` por `verbatimModuleSyntax`).

| Componente | Rol | API / estados |
|---|---|---|
| `Changelog` | changelog del release (flujo de actualización) | `releases: ReleaseNote[]` con `version/date/notes/current/latest`; badges "Instalada"/"Disponible" |
| `UpdateStatus` | estado del ciclo de actualización | `phase: UpdatePhase` (`checking/up-to-date/available/downloading/installing/success/error/rolling-back`), `progress`, `currentVersion/targetVersion`, `message`, `action`; `role="status"` (o `"alert"` en error) |
| `SegmentedControl` | selector de una opción (HQ vs sucursal) | `options/value/onChange/ariaLabel`; ARIA `radiogroup`/`radio` |
| `LicenseStatus` | estado licenciado/trial/vencida | `state: 'licensed'\|'trial'\|'expired'\|'unlicensed'\|'grace'`, `detail` |
| `FeatureList` | features activos/deshabilitados y permisos visuales | `features: FeatureListItem[]` con `label/description/enabled` |
| `ActivationKeyField` | campo de clave de activación | `value/onChange/onSubmit/loading/disabled/error/hint/groupSize`; normaliza mayúsculas + agrupación |
| `FingerprintNotice` | aviso de fingerprint de nodo | `fingerprint/algorithm/onCopy`; botón "Copiar" (portapapeles) |
| `clipboard` (util) | copia al portapapeles con fallback | `copyText(text): Promise<boolean>` |

## 4. Superficie 1 — Flujo de actualización

**Estados de la máquina** (mapeados por `UpdateStatus`):

```
checking → available → downloading → installing → success
    └────────────── up-to-date
    └────────────── error (reintentar)
success ──→ rolling-back → success (restauró)
```

**Mejoras propuestas (observables):**

1. **Botón "Buscar actualizaciones"** (`Button`, `loading` durante `checking`)
   inicia la búsqueda sin bloquear la app.
2. **Progreso de descarga** (`Progress` con `tone` según fase) + versión
   actual→objetivo (`v2.1.0 → v2.2.0`) para contexto inmediato.
3. **"Actualizando sin interrupción"** (`phase="installing"`): aviso persistente
   y no modal — la plataforma sigue sirviendo mientras se aplica; sin downtime
   percibido, sin pantalla bloqueante.
4. **Changelog del release** (`Changelog`) visible **antes** de aceptar la
   actualización, para que el usuario decida con información.
5. **Rollback** (`Button variant="destructive"` en el slot `action` de
   `UpdateStatus` durante `success`/`error`) para restaurar la versión anterior.
6. **Éxito/error** con `Alert`/`UpdateStatus` accionables: "Reintentar" en error,
   confirmación inequívoca en éxito.

## 5. Superficie 2 — Pantalla de activación de licencia

**Mejoras propuestas (observables):**

1. **Campo de clave de activación** (`ActivationKeyField`): normaliza a
   mayúsculas y agrupa en bloques (evita errores de tipeo), submit por Enter o
   botón "Activar" (`loading` previene doble envío).
2. **Estado licenciado/trial** (`LicenseStatus`): insignia semántica + detalle
   (fecha de vencimiento / días restantes).
3. **Features activos/deshabilitados** (`FeatureList`): lista con `enabled`
   true/false, check verde / guion atenuado, descripción de cada capacidad.
4. **Aviso de fingerprint de nodo** (`FingerprintNotice`): muestra el
   identificador con botón "Copiar" y explica el anclaje al hardware/entorno
   (riesgo de perder la validez si cambia el nodo).

## 6. Superficie 3 — Gestión de cadenas

**Mejoras propuestas (observables):**

1. **Selector casa matriz / sucursal** (`SegmentedControl`): elección
   excluyente y persistente del nodo activo, con icono (`bi-building` /
   `bi-shop`) y tooltip de alcance.
2. **Vista consolidada HQ vs vista de sucursal**: mismo `SegmentedControl` con
   opciones "Consolidado (HQ)" / "Esta sucursal"; la vista consolidada agrega
   todas las sucursales, la de sucursal solo sus propios datos.
3. **Permisos visuales** (`FeatureList`): qué capacidades ve/edita cada nivel
   (p. ej. "Gestión de precios" habilitado en HQ, "solo lectura" en sucursal,
   descrito en `description`). Los permisos se comunican por estilo atenuado +
   descripción, no solo por color.

## 7. Ejemplo de composición

```tsx
import { Card } from '../components/ui/Card';
import { UpdateStatus } from '../components/ui/UpdateStatus';
import { Changelog } from '../components/ui/Changelog';
import { Button } from '../components/ui/Button';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { LicenseStatus } from '../components/ui/LicenseStatus';
import { FeatureList } from '../components/ui/FeatureList';
import { ActivationKeyField } from '../components/ui/ActivationKeyField';
import { FingerprintNotice } from '../components/ui/FingerprintNotice';

<Card>
  <Card.Header>
    <Card.Title>Actualizaciones</Card.Title>
    <Card.Description>Mantén la plataforma al día</Card.Description>
  </Card.Header>
  <Card.Content className="flex flex-col gap-4">
    <UpdateStatus
      phase="available"
      currentVersion="2.1.0"
      targetVersion="2.2.0"
      action={<><Button>Instalar ahora</Button><Button variant="ghost">Ver changelog</Button></>}
    />
    <Changelog
      releases={[
        { id: 'v2.2.0', version: '2.2.0', date: '2026-10-20', latest: true,
          notes: ['Corrige el social-login', 'Añade selector de cadena'] },
        { id: 'v2.1.0', version: '2.1.0', current: true, notes: [] },
      ]}
    />
  </Card.Content>
</Card>

<Card>
  <Card.Header>
    <Card.Title>Licencia</Card.Title>
    <LicenseStatus state="trial" detail="Quedan 4 días de prueba" />
  </Card.Header>
  <Card.Content className="flex flex-col gap-4">
    <ActivationKeyField value={key} onChange={setKey} onSubmit={activate} loading={activating} />
    <FeatureList ariaLabel="Funcionalidades de la licencia" features={[
      { id: 'pos', label: 'Módulo POS', enabled: true, description: 'Ventas y stock en el local' },
      { id: 'chains', label: 'Multi-tenant por cadenas', enabled: false, description: 'Requiere plan Enterprise' },
    ]} />
    <FingerprintNotice fingerprint="a3f1:9c02:…:7d44" />
  </Card.Content>
</Card>

<Card>
  <Card.Header>
    <Card.Title>Alcance de la cadena</Card.Title>
  </Card.Header>
  <Card.Content className="flex flex-col gap-4">
    <SegmentedControl
      ariaLabel="Alcance de la vista"
      value={scope}
      onChange={setScope}
      options={[
        { value: 'hq', label: 'Consolidado (HQ)', icon: 'bi-building', description: 'Todas las sucursales' },
        { value: 'branch', label: 'Esta sucursal', icon: 'bi-shop', description: 'Solo este local' },
      ]}
    />
  </Card.Content>
</Card>
```

## 8. Criterios de aceptación (observables)

1. **Typecheck + lint + build en verde** para `@webs/web` (los nuevos componentes
   compilan y no rompen los ~142 imports existentes de los extendidos de t4).
2. **Catálogo completo**: cada componente de §3 existe, exporta la API declarada
   y consume solo tokens `--ws-*` (grep de colores fijos `#`/`rgb(` en los nuevos
   archivos no arroja valores fuera de los tokens).
3. **Estados cubiertos** en las 3 superficies: checking/downloading/installing/
   success/error/rollback (actualización); licensed/trial/expired/unlicensed/grace
   (licencia); HQ/branch + habilitado/deshabilitado (cadenas).
4. **Accesibilidad**: `role`/`aria-*` en `UpdateStatus` (status/alert + aria-live),
   `SegmentedControl` (radiogroup/radio + aria-checked), `FeatureList` (lista con
   `aria-label`), `ActivationKeyField` (label + aria-invalid/aria-describedby) y
   `FingerprintNotice` (role=note); foco visible heredado de `.btn:focus-visible`;
   `prefers-reduced-motion` respetado (spinner ya cubierto en t4).
5. **Sin lógica de backend**: los componentes no importan servicios/API ni hooks
   de datos; solo reciben props y devuelven callbacks.

## 9. Alcance no cubierto / pendiente (para fases siguientes)

1. **Cablear** los componentes a las páginas/servicios reales (endpoints de
   actualización, licencias, cadenas). t24 entrega spec + primitivas; la
   integración y la lógica de backend son de frontend/backend.
2. **Persistencia del estado** de actualización (descarga reanudable, progreso
   real de bytes, verificación de checksum) y **auto-update**.
3. **Verificación de hardware real** de la licencia (fingerprint del nodo lo
   produce backend; aquí solo se muestra y se copia).
4. **Verificación en dispositivo físico**: las decisiones de esfuerzo son
   provisionales hasta medirlas en un panel/tablet reales.

## 10. Evidencia de verificación

- `pnpm --filter @webs/web typecheck` → verde.
- `pnpm --filter @webs/web lint` → verde (o solo warnings preexistentes ajenos a t24).
- `pnpm --filter @webs/web build` → verde (si falla por causas preexistentes ajenas
  a t24, se documenta).
- Revisión de código de los componentes nuevos (estados + ARIA + tokens + ausencia
  de lógica de backend).
