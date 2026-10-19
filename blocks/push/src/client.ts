import { defineClientBlock, type BlockManifest } from '@webs/plugin-sdk';
import manifestJson from '../block.json';

const manifest = manifestJson as unknown as BlockManifest;

export default defineClientBlock(manifest, ({ container, i18n }) => {
  const el = document.createElement('div');
  const btn = document.createElement('button');
  btn.className = 'btn secondary';
  btn.textContent = i18n.t('enable');
  btn.onclick = async () => {
    if (!('Notification' in window)) return;
    const permission = await Notification.requestPermission();
    btn.textContent = permission === 'granted' ? 'Notificaciones activadas ✓' : i18n.t('enable');
  };
  el.appendChild(btn);
  container.appendChild(el);
  return () => el.remove();
});
