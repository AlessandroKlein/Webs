// @webs/mobile — utilidades de código de barras y puente con el companion de
// escritorio (@webs/desktop).

/**
 * Normaliza códigos de lectores externos (HID/keyboard-wedge, serial, cámara):
 * quita saltos de línea/tabulaciones y prefijos AIM/GS1 (p. ej. `]C0`, `]E0`).
 * Es la misma lógica que `normalizeBarcode` de
 * apps/web/src/components/ui/BarcodeScanner.tsx, replicada sin React para que la
 * PWA y el companion compartan el criterio de normalización.
 */
export function normalizeBarcode(raw) {
  return String(raw ?? '')
    .replace(/[\r\n\t]/g, '')
    .replace(/^\]\w\d/, '')
    .trim();
}

/**
 * Conecta con el companion de escritorio (@webs/desktop) y re-despacha cada
 * lectura `scan` ya normalizada. Reconecta automáticamente con backoff.
 *
 * @param {object} opts
 * @param {string} [opts.url]  URL del WebSocket (default `ws://localhost:4599`).
 * @param {(code: string, data: object) => void} opts.onCode  Código normalizado.
 * @param {(status: 'connecting'|'open'|'closed'|'error', info?: object) => void} [opts.onStatus]
 * @returns {{ close: () => void }}
 */
export function connectDesktopBridge({ url = 'ws://localhost:4599', onCode, onStatus } = {}) {
  let ws = null;
  let closedByUser = false;
  let retry = 0;
  let timer = null;

  function scheduleReconnect() {
    if (closedByUser) return;
    const delay = Math.min(1000 * 2 ** retry, 15000);
    retry += 1;
    timer = setTimeout(open, delay);
  }

  function open() {
    if (closedByUser) return;
    onStatus?.('connecting');
    try {
      ws = new WebSocket(url);
    } catch {
      scheduleReconnect();
      return;
    }

    ws.addEventListener('open', () => {
      retry = 0;
      onStatus?.('open');
    });

    ws.addEventListener('message', (event) => {
      let msg = null;
      try { msg = JSON.parse(event.data); } catch { return; }
      if (msg?.type === 'scan' && msg.data?.code != null) {
        const code = normalizeBarcode(String(msg.data.code));
        if (code) onCode(code, msg.data);
      }
    });

    ws.addEventListener('close', () => {
      ws = null;
      onStatus?.('closed');
      scheduleReconnect();
    });

    ws.addEventListener('error', () => {
      onStatus?.('error');
      // `close` se dispara a continuación; reconectamos ahí.
    });
  }

  open();

  return {
    close() {
      closedByUser = true;
      if (timer) clearTimeout(timer);
      if (ws) { ws.close(); ws = null; }
    },
  };
}
