import { defineClientBlock, type BlockManifest } from '@webs/plugin-sdk';
import manifestJson from '../block.json';

const manifest = manifestJson as unknown as BlockManifest;

export default defineClientBlock(manifest, ({ container }) => {
  const el = document.createElement('button');
  el.className = 'btn';
  el.textContent = '💬 Soporte';
  el.onclick = () => {
    const subject = window.prompt('Asunto');
    const message = window.prompt('Mensaje');
    if (subject && message) {
      void fetch('/api/v1/blocks/support/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, message }),
      });
    }
  };
  container.appendChild(el);
  return () => el.remove();
});
