# ADR-0007: Sistema de licencias/activación local anti-reverse-engineering (repo Licensify)

- **Estado:** Aceptado
- **Fecha:** 2026 (refactorización global de Webs, Milestone 2)
- **Decisión:** Crear **Licensify** — biblioteca independiente (repo
  `github.com/AlessandroKlein/Licensify`) de licenciamiento **local, sin servidor externo**:
  licencia firmada (Ed25519) + activación por **clave de activación** ligada a la máquina
  (fingerprint de hardware) + defensa en profundidad contra ingeniería inversa (cifrado
  AES-256-GCM, ofuscación de la rutina de verificación, checks anti-tamper y anti-reloj).
  Webs integra Licensify para licenciar plugins comerciales.

## Contexto

Webs **no tiene** sistema de licencias hoy: `license` en los `block.json` es solo metadato SPDX
(`"license": "MIT"` en los 30+ bloques). El objetivo pide un sistema de licencias/activación
**local anti-reverse-engineering**, sin servidor externo, con clave de activación y protección
contra ingeniería inversa, en un repo separado (`Licensify`).

Precedentes reutilizables en el código:

- `apps/api/src/lib/crypto.ts` — cifrado de campo AES-256-GCM, clave derivada de
  `ENCRYPTION_KEY` vía SHA-256, formato `iv.tag.ciphertext` en base64, y helpers
  `encryptSecretFields`/`decryptSecretFields` para secretos `x-ui.secret`.
- `apps/api/src/blocks/catalog.ts` — marketplace que ya **verifica firmas Ed25519** de bloques
  (`publicKey`/`signature` del `block.json`, `sha256` de integridad, `verified`, `source`
  `local|git|npm`). Es el patrón de «distribución firmada» que Licensify generaliza.

## Decisión

### 1. Licensify como biblioteca independiente

- Repo `github.com/AlessandroKlein/Licensify`, paquete `@licensify/core` (TypeScript), sin
  dependencia de Webs, consumible desde `apps/api` (y futuro CLI/desktop). Expone:

  - **Modelo de licencia** (firmado, inmutable):

    ```ts
    interface LicensePayload {
      id: string;                 // licencia única
      productId: string;          // plugin/producto licenciado
      licensee: string;           // titular
      features?: string[];        // capacidades habilitadas
      limits?: Record<string, number>;
      issuedAt: string;           // ISO-8601
      expiresAt?: string;
    }
    // Licencia = { payload: LicensePayload, signature: string /* Ed25519 base64 */ }
    ```

  - **Verificación de firma** — Ed25519 con la **clave pública del vendor** embebida en el
    consumidor; la clave privada nunca sale del entorno de emisión (CLI de Licensify).

  - **Clave de activación** — cadena corta (Base32/Crockford) que codifica el `LicensePayload`
    (o un seed) y se **cifra** con la clave derivada del fingerprint; al activar, se descifra y
    se valida la firma. La activación es **offline**: no hay llamada a servidor.

  - **Node-locking (fingerprint)** — la licencia activada se liga a un **fingerprint de
    hardware** (machine-id, MAC, CPU, serial de disco) **hasheado** (nunca el dato crudo). El
    payload activado se cifra con la clave derivada del fingerprint, de modo que copiar la
    licencia a otra máquina falla el descifrado.

### 2. Anti-reverse-engineering (defensa en profundidad, honesta sobre su límite)

Se aplican capas **no matemáticamente absolutas**, cuyo objetivo es elevar el coste del atacante:

1. **Integridad y firma**: `sha256` del payload + firma Ed25519 → detección de manipulación de
   la licencia.
2. **Cifrado**: AES-256-GCM (reutiliza el patrón de `crypto.ts`) sobre el payload activado y
   sobre la lógica sensible.
3. **Clave partida**: la clave de verificación/descifrado se divide en partes XOR-adas en
   runtime (split-key), evitando una única constante contigua en el binario.
4. **Ofuscación de la rutina de verificación**: build step con ofuscador (p. ej.
   `javascript-obfuscator` con control-flow flattening + string array) aplicado **solo** al
   código de verificación, no a toda la app (mantiene depurabilidad del resto).
5. **Anti-tamper / anti-reloj**: verificación periódica en runtime; detección de retroceso de
   reloj (marca monotónica + timestamp de última verificación persistido); verificación de
   integridad (hash) de la sección crítica de código.
6. **Anti-debug opcional**: detección de debugger attach / entorno instrumentado (best-effort).

**Límite declarado**: una verificación 100 % en cliente puede ser vencida por un atacante con
recursos. Licensify **no** promete inviolabilidad; promete firma a prueba de falsificación de la
licencia, ligado a máquina y coste de reverse-engineering alto. La protección más fuerte para
funcionalidad crítica debe combinarse con checks server-side cuando sea viable (fuera del
alcance «sin servidor externo» de este ADR, se documenta como opción).

### 3. Emisión (CLI del vendor)

- Licensify incluye un CLI (`@licensify/cli`) que el vendor usa **offline**: genera el par
  Ed25519, emite `LicensePayload`, firma y empaqueta la clave de activación. La clave privada se
  custodia fuera del repositorio público (variable de entorno / HSM opcional).

### 4. Integración con Webs

- Nuevo módulo `apps/api/src/modules/licenses/` que valida licencias vía `@licensify/core`.
- El manifiesto de plugin gana `commercial?: boolean` y `productId?: string`. Un plugin
  comercial requiere una licencia válida (firma + fingerprint + no expirada) para `activate`;
  sin ella, el plugin queda «sin licencia» (no se montan sus rutas/hooks).
- El fingerprint se calcula en el host de despliegue (server-side para plugins del API); el
  verificador se ejecuta en el backend de Webs.
- La verificación de marketplace de `catalog.ts` (Ed25519 del `block.json`) se **mantiene y
  complementa** (integridad de distribución) y no sustituye a la licencia (autorización de uso).

## Consecuencias

**Positivas**

- Activación offline (sin servidor de licencias que operar ni punto único de falla).
- Licencias no falsificables (firma Ed25519) y ligadas a máquina (fingerprint).
- Coste de reverse-engineering alto con varias capas independientes.
- Reutiliza primitivas existentes (AES-256-GCM, verificación Ed25519 del marketplace).

**Negativas / costes**

- **Gestión de clave privada** del vendor: si se filtra, se pueden emitir licencias (se mitiga
  con custodia externa y rotación de claves + `keyId` en el payload).
- La ofuscación complica depuración y puede disparar falsos positivos de AV/paquetes.
- El node-locking limita el movimiento de una licencia entre máquinas (se prevé
  re-activación limitada gestionada por el vendor).
- Protección probabilística, no absoluta; requiere comunicarlo para no prometer de más.

## Notas

- Baseline sync requerida: documentar Licensify en su propio repo (`README.md` + ADR interno) y
  en `docs/architecture/refactor-global.md`; el manifiesto de plugin (`plugin-system.md`) debe
  documentar `commercial`/`productId` y el flujo de activación.
- Relación con ADR-0005: el manifiesto pasa de `block.json` a `plugin.json`, por lo que los
  campos `commercial`/`productId` se definen sobre el contrato renombrado.
