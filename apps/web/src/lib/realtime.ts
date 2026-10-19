import { useEffect, useRef } from 'react';
import { getAccessToken } from './token';
import { useAuthStore } from './auth-store';

/**
 * Hook de tiempo real: abre un WebSocket en `/ws` (autenticado por token) y se
 * suscribe al canal `user:<id>` del usuario logueado. Cada frame `{channel,
 * event, payload}` invoca `onEvent(event, payload)`.
 *
 * Úsalo SOLO en las pantallas que necesitan actualización en vivo (campana de
 * notificaciones, chat, direct). No lo montes en todas las páginas.
 */
export function useRealtime(onEvent?: (event: string, payload: unknown) => void) {
  const user = useAuthStore((s) => s.user);
  const cbRef = useRef(onEvent);
  cbRef.current = onEvent;

  useEffect(() => {
    const token = getAccessToken();
    const userId = user?.id;
    if (!token || !userId) return;

    const base = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '';
    const url = base
      ? `${base.replace(/^http/, 'ws')}/ws?token=${encodeURIComponent(token)}`
      : `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws?token=${encodeURIComponent(token)}`;

    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      return;
    }

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'subscribe', channel: `user:${userId}` }));
    };
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data as string) as { event?: string; payload?: unknown };
        if (msg.event && msg.payload !== undefined) cbRef.current?.(msg.event, msg.payload);
      } catch {
        /* ignora frames malformados */
      }
    };

    return () => {
      try {
        ws.close();
      } catch {
        /* noop */
      }
    };
  }, [user?.id]);
}
