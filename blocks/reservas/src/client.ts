import { defineClientBlock, type BlockManifest } from '@webs/plugin-sdk';
import manifestJson from '../block.json';

const manifest = manifestJson as unknown as BlockManifest;

const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('webs_access_token') ?? ''}` });

export default defineClientBlock(manifest, ({ container, config }) => {
  const services = (Array.isArray(config.services) ? config.services : []) as Array<{ id: string; name: string; duration: number; price: number }>;
  const el = document.createElement('div');
  el.innerHTML = `<select class="input" id="svc">${services.map((s) => `<option value="${s.id}">${s.name} (${s.duration} min · $${s.price})</option>`).join('')}</select>
    <input class="input" id="name" placeholder="Tu nombre" /><input class="input" id="date" type="datetime-local" />
    <button class="btn" id="book">Reservar</button><p class="muted" id="msg"></p>`;
  container.appendChild(el);
  el.querySelector('#book')!.addEventListener('click', async () => {
    await fetch('/api/v1/blocks/reservas/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ serviceId: (el.querySelector('#svc') as HTMLSelectElement).value, name: (el.querySelector('#name') as HTMLInputElement).value, date: (el.querySelector('#date') as HTMLInputElement).value }),
    });
    el.querySelector('#msg')!.textContent = 'Reserva confirmada ✓';
  });
  return () => el.remove();
});
