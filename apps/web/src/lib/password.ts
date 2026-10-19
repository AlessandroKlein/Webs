/**
 * Validación de fortaleza de contraseña compartida entre pantallas.
 *
 * Reglas requeridas:
 *  - mínimo 8 caracteres
 *  - al menos 1 letra (mayúscula o minúscula)
 *  - al menos 1 número
 *  - al menos 1 carácter especial (no alfanumérico ni espacio)
 */
export interface PasswordValidation {
  ok: boolean;
  errors: string[];
}

export function validatePassword(pwd: string): PasswordValidation {
  const errors: string[] = [];

  if (pwd.length < 8) {
    errors.push('Debe tener al menos 8 caracteres');
  }
  if (!/[A-Za-z]/.test(pwd)) {
    errors.push('Debe incluir al menos una letra');
  }
  if (!/[0-9]/.test(pwd)) {
    errors.push('Debe incluir al menos un número');
  }
  if (!/[^A-Za-z0-9\s]/.test(pwd)) {
    errors.push('Debe incluir al menos un carácter especial (ej: !, @, #, …)');
  }

  return { ok: errors.length === 0, errors };
}
