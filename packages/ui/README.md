# @webs/ui

Sistema de temas (claro/oscuro) y tokens de diseño de la plataforma Webs.

## Uso

1. Importa los estilos una sola vez en el shell de tu app:

   ```ts
   import '@webs/ui/styles.css';
   ```

2. Envuelve la app con el proveedor de tema:

   ```tsx
   import { ThemeProvider } from '@webs/ui';

   <ThemeProvider initialMode="system">
     <App />
   </ThemeProvider>;
   ```

3. Consume el tema con el hook:

   ```tsx
   import { useTheme } from '@webs/ui';

   function Toggle() {
     const { mode, resolved, setMode } = useTheme();
     return <button onClick={() => setMode(resolved === 'dark' ? 'light' : 'dark')}>{mode}</button>;
   }
   ```

## Tokens

Todos los tokens viven en `src/styles/tokens.css` como variables CSS (`--ws-*`).
Los administradores pueden sobrescribirlos desde la UI (Apariencia → CSS
personalizado), por lo que el styling debe consumir siempre tokens y nunca
colores fijos.
