/** Montos en centavos → cadena decimal (12345 → "123.45"). */
export function formatMoney(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** Fecha/timestamp → representación local del usuario. Valor nulo/inválido se degrada sin romper. */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString();
}
