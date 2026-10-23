/**
 * Smoke del generador de SDK (t106, ADR-0020): valida las funciones puras de
 * codegen (JSON Schema → tipos TS + módulo de recurso). No toca la red ni `api.ts`.
 */
import { jsonSchemaToTsType } from '../../web/src/lib/generated/schema-to-ts';
import {
  generateEntityType,
  generateResourceSdk,
  toCamelCase,
  toPascalCase,
} from '../../web/src/lib/generated/codegen';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean): void {
  if (cond) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    console.log(`  ✗ ${name}`);
  }
}

type Schema = Record<string, unknown>;

const productSchema: Schema = {
  type: 'object',
  required: ['name', 'price'],
  properties: {
    name: { type: 'string', description: 'Nombre del producto' },
    price: { type: 'number' },
    description: { type: 'string' },
    active: { type: 'boolean' },
    tags: { type: 'array', items: { type: 'string' } },
    kind: { type: 'string', enum: ['physical', 'digital'] },
    meta: { type: 'object', properties: { weight: { type: 'number' } } },
  },
  additionalProperties: false,
};

console.log('toPascalCase / toCamelCase');
check('products → Products', toPascalCase('products') === 'Products');
check('blog-posts → BlogPosts', toPascalCase('blog-posts') === 'BlogPosts');
check('product → Product', toPascalCase('product') === 'Product');
check('BlogPost → blogPost', toCamelCase('BlogPost') === 'blogPost');
check('clave vacía → Resource', toPascalCase('---') === 'Resource');

console.log('jsonSchemaToTsType');
check('string', jsonSchemaToTsType({ type: 'string' }) === 'string');
check('number', jsonSchemaToTsType({ type: 'number' }) === 'number');
check('integer → number', jsonSchemaToTsType({ type: 'integer' }) === 'number');
check('boolean', jsonSchemaToTsType({ type: 'boolean' }) === 'boolean');
check('array', jsonSchemaToTsType({ type: 'array', items: { type: 'string' } }) === 'Array<string>');
check('enum', jsonSchemaToTsType({ type: 'string', enum: ['a', 'b'] }) === '"a" | "b"');
check(
  'object (required)',
  jsonSchemaToTsType({ type: 'object', required: ['x'], properties: { x: { type: 'number' } } }) ===
    '{ x: number; }',
);
check(
  'object (opcional)',
  jsonSchemaToTsType({ type: 'object', properties: { x: { type: 'number' } } }) === '{ x?: number; }',
);
check('sin type ni props → unknown', jsonSchemaToTsType({}) === 'unknown');

console.log('generateEntityType (required vs optional)');
const entity = generateEntityType('Product', productSchema);
check('interface Product', entity.includes('export interface Product'));
check('required name', entity.includes('name: string;'));
check('required price', entity.includes('price: number;'));
check('optional description', entity.includes('description?: string;'));
check('nested object', entity.includes('meta?: { weight?: number; };'));
check('enum union', entity.includes('kind?: "physical" | "digital";'));
check('array', entity.includes('tags?: Array<string>;'));
check('jsdoc description', entity.includes('/** Nombre del producto */'));

console.log('generateResourceSdk (módulo completo)');
const sdk = generateResourceSdk('products', 'Productos', productSchema);
check(
  'import cliente',
  sdk.includes("import { createGeneratedClient, type GeneratedRecord } from '../client';"),
);
check('cliente tipado', sdk.includes("createGeneratedClient<Products>('products')"));
check('const export', sdk.includes('export const products'));
check('input type', sdk.includes('export type ProductsInput = Products;'));
check('record type', sdk.includes('export type ProductsRecord = GeneratedRecord<Products>;'));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
