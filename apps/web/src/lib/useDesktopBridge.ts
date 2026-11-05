import { useEffect, useRef } from 'react';
import { normalizeBarcode } from '../components/ui/BarcodeScanner';

export type DesktopBridgeStatus = 'connecting' | 'open' | 'closed' | 'error';

export interface DesktopBridgeOptions {
  /** Solo conecta cuando es `true`; al cambiar a `false` se cierra y limpia. */
  enabled: boolean;
  /** Código ya normalizado (reusando `normalizeBarcode`). */
  onCode: (code: string) => void;
  url?: string;
  onStatus?: (status: DesktopBridgeStatus) => void;
}

const DEFAULT_URL = 'ws://localhost:4599';

/**
 * Puente con el companion de escritorio (@webs/desktop) para lectores seriales.
 * Escucha el evento `{ type: 'scan', data: { code } }`, normaliza y reconecta
 * con backoff. Replica `connectDesktopBridge` de `apps/mobile/src/barcode.js`
 * como hook React, guardando `window` para SSR/test.
 */
export function useDesktopBridge({ enabled, onCode, url = DEFAULT_URL, onStatus }: DesktopBridgeOptions) {
  const onCodeRef = useRef(onCode);
  const onStatusRef = useRef(onStatus);
  // Deduplica lecturas repetidas del lector serial (a veces emite dos veces seguidas).
  const lastCodeRef = useRef<{ code: string; at: number } | null>(null);

  useEffect(() => {
    onCodeRef.current = onCode;
  }, [onCode]);

  useEffect(() => {
    onStatusRef.current = onStatus;
  }, [onStatus]);

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === 'undefined' || typeof window.WebSocket !== 'function') return;

    let ws: WebSocket | null = null;
    let closed = false;
    let retry = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const schedule = () => {
      if (closed) return;
      const delay = Math.min(1000 * 2 ** retry, 15000);
      retry += 1;
      timer = setTimeout(open, delay);
    };

    const open = () => {
      if (closed) return;
      onStatusRef.current?.('connecting');
      try {
        ws = new WebSocket(url);
      } catch {
        schedule();
        return;
      }

      ws.addEventListener('open', () => {
        retry = 0;
        onStatusRef.current?.('open');
      });

      ws.addEventListener('message', (event) => {
        let msg: unknown;
        try {
          msg = JSON.parse(String(event.data));
        } catch {
          return;
        }
        if (!msg || typeof msg !== 'object' || (msg as { type?: unknown }).type !== 'scan') return;
        const code = (msg as { data?: { code?: unknown } }).data?.code;
        if (typeof code !== 'string') return;
        const normalized = normalizeBarcode(code);
        if (!normalized) return;
        const now = Date.now();
        const last = lastCodeRef.current;
        if (last && last.code === normalized && now - last.at < 1500) return;
        lastCodeRef.current = { code: normalized, at: now };
        onCodeRef.current(normalized);
      });

      ws.addEventListener('close', () => {
        ws = null;
        onStatusRef.current?.('closed');
        schedule();
      });

      ws.addEventListener('error', () => {
        onStatusRef.current?.('error');
      });
    };

    open();

    return () => {
      closed = true;
      if (timer) clearTimeout(timer);
      if (ws) {
        ws.close();
        ws = null;
      }
    };
  }, [enabled, url]);
}
