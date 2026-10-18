import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Configuración base de ESLint (flat config) compartida por todo el monorepo.
 * Cada app/paquete la extiende y añade reglas específicas (React, etc.).
 *
 * Uso en un paquete:
 *   import base from '@webs/config/eslint';
 *   export default [...base, { rules: { ... } }];
 */
export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/node_modules/**',
      '**/.turbo/**',
      '**/coverage/**',
      '**/generated/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
);
