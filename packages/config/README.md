# @webs/config

Configuración compartida del monorepo **Webs**.

- `@webs/config/eslint` — configuración base de ESLint (flat config, TypeScript).
- `@webs/config/prettier` — configuración de Prettier.

## Uso

### ESLint

Crea un `eslint.config.js` en tu paquete:

```js
import base from '@webs/config/eslint';

export default [
  ...base,
  {
    rules: {
      // reglas específicas del paquete
    },
  },
];
```

### Prettier

```js
// prettier.config.js
import config from '@webs/config/prettier';
export default config;
```
