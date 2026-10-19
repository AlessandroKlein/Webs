import { defineBlock, type BlockManifest } from '@webs/plugin-sdk';
import manifestJson from '../block.json';

const manifest = manifestJson as unknown as BlockManifest;

// Distancia de Levenshtein (tolerancia a errores de tipeo).
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i]![0] = i;
  for (let j = 0; j <= n; j++) dp[0]![j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(dp[i - 1]![j]! + 1, dp[i]![j - 1]! + 1, dp[i - 1]![j - 1]! + cost);
    }
  }
  return dp[m]![n]!;
}

const INDEX = ['Inicio', 'Tienda', 'Cursos', 'Contacto', 'Plantillas', 'Pagos', 'Bloques', 'SEO', 'Analítica'];

export default defineBlock(manifest, {
  register: async (fastify, config) => {
    const minChars = Number((config as Record<string, unknown>).minChars ?? 2);

    fastify.get('/search', async (request: unknown) => {
      const { query } = request as { query?: { q?: string } };
      const q = (query?.q ?? '').toLowerCase().trim();
      if (q.length < minChars) return { query: q, results: [] };

      const results = INDEX.map((item) => ({ item, score: levenshtein(q, item.toLowerCase()) }))
        .filter((r) => r.score <= 3 || itemIncludes(r.item.toLowerCase(), q))
        .sort((a, b) => a.score - b.score)
        .slice(0, 10)
        .map((r) => r.item);
      return { query: q, results };
    });

    function itemIncludes(item: string, q: string): boolean {
      return q.split(/\s+/).every((word) => item.includes(word));
    }
  },
});
