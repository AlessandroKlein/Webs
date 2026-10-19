import { defineClientBlock, type BlockManifest } from '@webs/plugin-sdk';
import manifestJson from '../block.json';

const manifest = manifestJson as unknown as BlockManifest;

export default defineClientBlock(manifest, ({ container, i18n }) => {
  const el = document.createElement('div');
  el.innerHTML = `<p class="muted">${i18n.t('invoicing')}</p>`;
  container.appendChild(el);
  return () => el.remove();
});
