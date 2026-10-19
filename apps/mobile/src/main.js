// @webs/mobile — Asistencia por QR (PWA instalable).
// Consume el endpoint existente POST /api/v1/blocks/organizaciones/attendance/scan
// del backend de Webs, enviando el token de acceso como Authorization: Bearer.

import './style.css';

// ---------------------------------------------------------------------------
// Configuración
// ---------------------------------------------------------------------------
// Base de la API. Vacío = mismo origen (la PWA se sirve detrás del mismo host
// que la API). Se puede sobrescribir compilando con VITE_API_BASE o en la UI.
const ENV_API_BASE = import.meta.env.VITE_API_BASE || '';
const BASE_URL = import.meta.env.BASE_URL; // p. ej. '/asistencia/'
const ATTENDANCE_PATH = '/api/v1/blocks/organizaciones/attendance/scan';

// ---------------------------------------------------------------------------
// Estado persistente (localStorage)
// ---------------------------------------------------------------------------
const store = {
  get token() { return localStorage.getItem('webs.mobile.token') || ''; },
  set token(v) { localStorage.setItem('webs.mobile.token', v); },
  get apiBase() { return localStorage.getItem('webs.mobile.apiBase') || ENV_API_BASE; },
  set apiBase(v) { localStorage.setItem('webs.mobile.apiBase', v); },
  get log() {
    try { return JSON.parse(localStorage.getItem('webs.mobile.log') || '[]'); }
    catch { return []; }
  },
  set log(v) { localStorage.setItem('webs.mobile.log', JSON.stringify(v.slice(0, 50))); },
};

// ---------------------------------------------------------------------------
// Referencias al DOM
// ---------------------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const tokenInput = $('token');
const qrInput = $('qrcode');
const scanBtn = $('scan');
const toggleBtn = $('toggle-token');
const apiBaseInput = $('api-base');
const resultEl = $('result');
const logEl = $('log');
const clearLogBtn = $('clear-log');
const installBadge = $('install-hint');

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------
const fmtDateTime = (iso) => (iso ? new Date(iso).toLocaleString('es') : '—');

function escapeHtml(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function apiBase() {
  const raw = (apiBaseInput.value || '').trim();
  return raw ? raw.replace(/\/+$/, '') : '';
}

function buildResultHtml(result) {
  if (!result) return '';
  if (result.ok) {
    const m = result.membership || {};
    const name = m.userName || m.userId || '—';
    const org = result.organization || m.organizationName || '—';
    const at = result.record?.timestamp || new Date().toISOString();
    return `
      <div class="result-banner ok">
        <div class="result-title">✓ Asistencia registrada</div>
        <dl class="result-grid">
          <dt>Organización</dt><dd>${escapeHtml(org)}</dd>
          <dt>Miembro</dt><dd>${escapeHtml(name)}</dd>
          <dt>Fecha</dt><dd>${fmtDateTime(at)}</dd>
        </dl>
      </div>`;
  }
  return `
    <div class="result-banner error">
      <div class="result-title">✕ No se pudo registrar</div>
      <p>${escapeHtml(result.error || 'Error desconocido')}</p>
    </div>`;
}

function showResult(result) {
  resultEl.innerHTML = buildResultHtml(result);
  resultEl.hidden = !result;
}

function renderLog() {
  const items = store.log;
  logEl.innerHTML = items.length
    ? items.map((it) => `
        <li>
          <span class="log-code">${escapeHtml(it.code)}</span>
          <span class="log-meta">${escapeHtml(it.name || '')} · ${fmtDateTime(it.at)}</span>
        </li>`).join('')
    : '<li class="log-empty">Sin registros todavía.</li>';
}

function pushLog(code, name) {
  const next = [{ code, name, at: new Date().toISOString() }, ...store.log];
  store.log = next;
  renderLog();
}

// ---------------------------------------------------------------------------
// Registrar asistencia
// ---------------------------------------------------------------------------
async function registrar() {
  const code = qrInput.value.trim();
  const token = tokenInput.value.trim();

  if (!code) {
    showResult({ ok: false, error: 'Ingresá o escaneá un código QR.' });
    qrInput.focus();
    return;
  }
  if (!token) {
    showResult({ ok: false, error: 'Falta el access token.' });
    tokenInput.focus();
    return;
  }

  scanBtn.disabled = true;
  scanBtn.textContent = 'Registrando…';
  const url = `${apiBase()}${ATTENDANCE_PATH}`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ qrcode: code }),
    });

    let data = null;
    try { data = await res.json(); } catch { /* respuesta sin JSON */ }

    if (!res.ok) {
      const msg = data?.error
        || (res.status === 401 ? 'Token inválido o vencido.' : `Error ${res.status}`);
      showResult({ ok: false, error: msg });
      return;
    }

    // El endpoint devuelve { ok, membership, organization, record } o { ok:false, error }.
    showResult(data || { ok: true });
    if (data?.ok) {
      const m = data.membership || {};
      pushLog(code, m.userName || m.userId || data.organization || '');
      qrInput.value = '';
      qrInput.focus();
    }
  } catch (err) {
    showResult({ ok: false, error: `No se pudo conectar: ${err.message}` });
  } finally {
    scanBtn.disabled = false;
    scanBtn.textContent = 'Registrar';
  }
}

// ---------------------------------------------------------------------------
// Eventos de UI
// ---------------------------------------------------------------------------
scanBtn.addEventListener('click', registrar);

qrInput.addEventListener('keydown', (e) => {
  // Un lector "keyboard wedge" tipea el código y termina con Enter.
  if (e.key === 'Enter') {
    e.preventDefault();
    registrar();
  }
});

toggleBtn.addEventListener('click', () => {
  const hidden = tokenInput.type === 'password';
  tokenInput.type = hidden ? 'text' : 'password';
  toggleBtn.textContent = hidden ? 'Ocultar' : 'Ver';
});

clearLogBtn.addEventListener('click', () => {
  store.log = [];
  renderLog();
});

tokenInput.addEventListener('input', () => { store.token = tokenInput.value.trim(); });
apiBaseInput.addEventListener('input', () => { store.apiBase = apiBaseInput.value.trim(); });

// ---------------------------------------------------------------------------
// Instalación PWA (botón "Instalar" opcional)
// ---------------------------------------------------------------------------
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  installBadge.hidden = false;
});
installBadge.addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  installBadge.hidden = true;
});

// ---------------------------------------------------------------------------
// Service Worker
// ---------------------------------------------------------------------------
if ('serviceWorker' in navigator) {
  // BASE_URL = '/asistencia/' en producción; el sw.js vive en public/ y se sirve
  // bajo esa base, por lo que su scope por defecto ya es /asistencia/.
  navigator.serviceWorker.register(`${BASE_URL}sw.js`).catch((err) => {
    console.warn('[sw] no se pudo registrar el service worker:', err);
  });
}

// ---------------------------------------------------------------------------
// Inicialización
// ---------------------------------------------------------------------------
tokenInput.value = store.token;
apiBaseInput.value = store.apiBase;
renderLog();
qrInput.focus();
