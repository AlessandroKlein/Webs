import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

/** Renderiza un código QR (imagen data-URL) a partir de una cadena (otpauth://, URL, etc.). */
export function QrCode({ value, size = 168 }: { value: string; size?: number }) {
  const [dataUrl, setDataUrl] = useState<string>('');

  useEffect(() => {
    QRCode.toDataURL(value, { width: size, margin: 1 })
      .then(setDataUrl)
      .catch(() => setDataUrl(''));
  }, [value, size]);

  if (!dataUrl) return null;
  return (
    <img
      src={dataUrl}
      alt="Código QR"
      width={size}
      height={size}
      style={{ border: '1px solid var(--ws-border)', borderRadius: 'var(--ws-radius-md)', background: '#fff' }}
    />
  );
}
