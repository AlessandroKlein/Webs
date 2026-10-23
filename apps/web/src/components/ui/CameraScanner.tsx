import { useEffect, useRef, useState } from 'react';
import { Button } from './Button';
import { cn } from './cn';

/**
 * Detector de códigos de barras/QR por cámara.
 *
 * Usa la API nativa `BarcodeDetector` (Chrome/Android WebView, Safari 17+),
 * disponible en el WebView de Capacitor tanto en Android como en iOS moderno.
 * Cuando no está disponible se informa y queda el fallback manual/HID.
 */
interface DetectorLike {
  detect(source: CanvasImageSource): Promise<Array<{ rawValue: string }>>;
}

type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => DetectorLike;

declare global {
  interface Window {
    BarcodeDetector?: BarcodeDetectorCtor;
  }
}

const FORMATS = [
  'qr_code',
  'ean_13',
  'ean_8',
  'upc_a',
  'upc_e',
  'code_128',
  'code_39',
  'code_93',
  'codabar',
  'itf',
  'data_matrix',
  'aztec',
  'pdf417',
];

export function isBarcodeDetectorSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.BarcodeDetector === 'function';
}

export interface CameraScannerProps {
  /** Si está en `true`, abre el visor de cámara y empieza a escanear. */
  open: boolean;
  /** Se invoca una vez por código detectado (ya sin saltos de línea). */
  onCode: (code: string) => void;
  onClose: () => void;
}

/**
 * Visor de cámara para lectores de código. Pensado como slot de `BarcodeScanner`
 * (`onRequestCamera`), pero usable de forma independiente.
 *
 * Al detectar un código emite `onCode` una única vez y cierra. Limpia el stream
 * de cámara al cerrarse o desmontarse (importante en Capacitor para liberar el
 * sensor y no dejarlo encendido).
 */
export function CameraScanner({ open, onCode, onClose }: CameraScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const firedRef = useRef(false);
  const onCodeRef = useRef(onCode);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    onCodeRef.current = onCode;
  }, [onCode]);

  useEffect(() => {
    if (!open) {
      firedRef.current = false;
      setError('');
      setStarting(false);
      return;
    }

    let stream: MediaStream | null = null;
    let raf = 0;
    let cancelled = false;

    async function start() {
      setStarting(true);
      setError('');
      firedRef.current = false;

      const video = videoRef.current;
      if (!video) return;

      if (!isBarcodeDetectorSupported()) {
        setError('Este dispositivo no soporta lectura de código por cámara. Usá el teclado o un lector USB.');
        setStarting(false);
        return;
      }

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        });
      } catch {
        setError('No se pudo acceder a la cámara. Verificá los permisos de la app.');
        setStarting(false);
        return;
      }

      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      video.srcObject = stream;
      video.setAttribute('playsinline', 'true');
      await video.play().catch(() => undefined);

      const detector = new window.BarcodeDetector!({ formats: FORMATS });

      const tick = async () => {
        if (cancelled || firedRef.current) return;
        if (video.readyState >= 2) {
          try {
            const codes = await detector.detect(video);
            const first = codes[0];
            if (first && !firedRef.current) {
              firedRef.current = true;
              onCodeRef.current(first.rawValue);
              return; // onCode → el padre cierra el visor (cleanup detiene el stream)
            }
          } catch {
            /* frame sin lectura: reintentar en el siguiente tick */
          }
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      setStarting(false);
    }

    void start();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      if (stream) stream.getTracks().forEach((t) => t.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Escanear código con cámara"
    >
      <div className="flex w-full max-w-md flex-col gap-3 rounded-xl bg-surface p-4 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-text">Escanear código</h3>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Cerrar escáner">
            <i className="bi bi-x-lg" aria-hidden="true" />
          </Button>
        </div>

        <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-black">
          <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
          {starting && (
            <div className="absolute inset-0 flex items-center justify-center text-white/80">
              <span className="spinner" aria-hidden="true" />
            </div>
          )}
          {!error && !starting && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="h-40 w-40 rounded-md border-2 border-accent opacity-80" />
            </div>
          )}
        </div>

        {error && (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        )}

        <p className={cn('text-sm text-muted')}>Apuntá la cámara al código. Al detectarlo se registra solo.</p>
      </div>
    </div>
  );
}
