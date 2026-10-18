import { defineClientBlock, type BlockManifest } from '@webs/plugin-sdk';
import manifestJson from '../block.json';

const manifest = manifestJson as unknown as BlockManifest;

/**
 * Bloque de ejemplo — cliente.
 *
 * Monta un nodo DOM en el contenedor del slot usando su configuración. El
 * `mount` puede ser React, Vue o DOM puro: el contrato solo pide recibir el
 * contenedor y devolver (opcionalmente) una función de limpieza.
 */
export default defineClientBlock(manifest, ({ container, config }) => {
  const greeting = typeof config.greeting === 'string' ? config.greeting : 'Hola';
  const showTime = Boolean(config.showTime);

  const el = document.createElement('div');
  el.style.padding = 'var(--ws-space-4, 16px)';
  el.style.border = '1px solid var(--ws-border, #e5e7eb)';
  el.style.borderRadius = 'var(--ws-radius-md, 8px)';
  el.style.background = 'var(--ws-surface, #fff)';
  el.innerHTML = `<strong>${greeting}</strong>${
    showTime ? `<p class="muted">${new Date().toLocaleTimeString()}</p>` : ''
  }`;

  container.appendChild(el);
  return () => {
    el.remove();
  };
});
