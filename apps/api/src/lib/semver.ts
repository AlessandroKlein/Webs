/** Compara versiones `x.y.z` (ignora sufijos `-rc`/`+build`). Negativo si `a < b`. */
export function compareVersions(a: string, b: string): number {
  const core = (v: string) => v.split(/[-+]/, 1)[0] || v;
  const pa = core(a).split('.').map((p) => Number.parseInt(p, 10) || 0);
  const pb = core(b).split('.').map((p) => Number.parseInt(p, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
