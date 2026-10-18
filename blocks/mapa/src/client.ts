import { defineClientBlock, type BlockManifest } from '@webs/plugin-sdk';
import manifestJson from '../block.json';

const manifest = manifestJson as unknown as BlockManifest;

export default defineClientBlock(manifest, ({ container, config, i18n }) => {
  const address = String(config.address ?? '');
  const phone = String(config.phone ?? '');
  const email = String(config.email ?? '');
  const lat = String(config.lat ?? '');
  const lng = String(config.lng ?? '');
  const mapLink = lat && lng ? `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=15/${lat}/${lng}` : null;

  const el = document.createElement('div');
  el.style.padding = 'var(--ws-space-4, 16px)';
  el.style.border = '1px solid var(--ws-border, #e5e7eb)';
  el.style.borderRadius = 'var(--ws-radius-md, 8px)';
  el.innerHTML = `<strong>${i18n.t('contact')}</strong>${
    address ? `<p class="muted"><i class="bi bi-geo-alt"></i> ${address}</p>` : ''
  }${phone ? `<p class="muted"><i class="bi bi-telephone"></i> ${phone}</p>` : ''}${
    email ? `<p class="muted"><i class="bi bi-envelope"></i> ${email}</p>` : ''
  }${mapLink ? `<a href="${mapLink}" target="_blank" rel="noopener" class="btn secondary">${i18n.t('map')}</a>` : ''}`;

  container.appendChild(el);
  return () => el.remove();
});
