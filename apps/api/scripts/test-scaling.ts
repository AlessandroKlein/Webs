/* Test unitario t153: generador YAML + validación + guarda de exclusión HPA/VPA.
 * Corre con: pnpm --filter @webs/api exec tsx scripts/test-scaling.ts
 */
import {
  DEFAULT_CONFIG,
  generateHpaYaml,
  generateVpaYaml,
  generateWorkloadYaml,
  normalizeCpu,
  normalizeMemory,
  validateWorkloadScaling,
} from '../src/modules/scaling';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) {
    passed += 1;
    console.log(`PASS ${name}`);
  } else {
    failed += 1;
    console.log(`FAIL ${name}`);
  }
}

function throws(fn: () => unknown): boolean {
  try {
    fn();
    return false;
  } catch {
    return true;
  }
}

function main(): void {
  // 1. Unidades k8s (normalización + regex).
  check('normalizeCpu 250m válido', normalizeCpu('250m') === '250m');
  check('normalizeCpu 1 válido', normalizeCpu('1') === '1');
  check('normalizeCpu 0.5 válido', normalizeCpu('0.5') === '0.5');
  check('normalizeCpu abc inválido', throws(() => normalizeCpu('abc')));
  check('normalizeMemory 512Mi válido', normalizeMemory('512Mi') === '512Mi');
  check('normalizeMemory 2Gi válido', normalizeMemory('2Gi') === '2Gi');
  check('normalizeMemory 256M válido', normalizeMemory('256M') === '256M');
  check('normalizeMemory 1GB inválido', throws(() => normalizeMemory('1GB')));

  // 2. Generador YAML.
  const hpa = generateHpaYaml(DEFAULT_CONFIG.api);
  check('HPA kind + apiVersion', hpa.includes('kind: HorizontalPodAutoscaler') && hpa.includes('apiVersion: autoscaling/v2'));
  check('HPA min/max', hpa.includes('minReplicas: 2') && hpa.includes('maxReplicas: 10'));
  check('HPA targets CPU/mem', hpa.includes('averageUtilization: 70'));

  const vpaWl = { ...DEFAULT_CONFIG.api, mode: 'vertical' as const, hpa: { ...DEFAULT_CONFIG.api.hpa, cpuTargetPct: 0, memTargetPct: 0 }, vpa: { ...DEFAULT_CONFIG.api.vpa, updateMode: 'Auto' as const } };
  const vpa = generateVpaYaml(vpaWl);
  check('VPA kind + apiVersion', vpa.includes('kind: VerticalPodAutoscaler') && vpa.includes('apiVersion: autoscaling.k8s.io/v1'));
  check('VPA updateMode Auto', vpa.includes('updateMode: Auto'));
  check('VPA controlledResources', vpa.includes('controlledResources: ["cpu", "memory"]'));

  check('generateWorkloadYaml horizontal→HPA', generateWorkloadYaml(DEFAULT_CONFIG.api).includes('HorizontalPodAutoscaler'));
  check('generateWorkloadYaml vertical→VPA', generateWorkloadYaml(vpaWl).includes('VerticalPodAutoscaler'));

  // 3. Guarda de exclusión HPA↔VPA.
  check('horizontal + updateMode Off OK', validateWorkloadScaling('api', { mode: 'horizontal' }, DEFAULT_CONFIG.api).vpa.updateMode === 'Off');
  check(
    'horizontal + updateMode Auto → 422',
    throws(() => validateWorkloadScaling('api', { mode: 'horizontal', vpa: { updateMode: 'Auto' } }, DEFAULT_CONFIG.api)),
  );
  check(
    'vertical + hpa target CPU > 0 → 422',
    throws(() => validateWorkloadScaling('api', { mode: 'vertical' }, DEFAULT_CONFIG.api)),
  );
  const verticalOk = validateWorkloadScaling(
    'api',
    { mode: 'vertical', hpa: { cpuTargetPct: 0, memTargetPct: 0 }, vpa: { updateMode: 'Auto' } },
    DEFAULT_CONFIG.api,
  );
  check('vertical + targets 0 OK', verticalOk.mode === 'vertical' && verticalOk.vpa.updateMode === 'Auto');

  // 4. Mapeo Recommender→Off.
  const recommender = validateWorkloadScaling('api', { mode: 'horizontal', vpa: { updateMode: 'Recommender' } }, DEFAULT_CONFIG.api);
  check('Recommender → Off', recommender.vpa.updateMode === 'Off');

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main();
