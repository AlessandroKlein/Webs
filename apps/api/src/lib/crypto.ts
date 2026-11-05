// Re-export del cifrado compartido en @webs/core (extraído de lib/crypto para que
// los plugins no importen `../../../apps/api/...`). ADR-0028.
export {
  encrypt,
  decrypt,
  hasEncryptionKey,
  SECRET_MASK,
  encryptSecretFields,
  decryptSecretFields,
  redactSecretFields,
  restoreMaskedSecrets,
} from '@webs/core';
