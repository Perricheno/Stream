import { useEffect, useState } from "react";
import QRCode from "qrcode";

interface QrCodeImageProps {
  value: string;
  size?: number;
}

/** Renders `value` as a scannable QR — used for showing a room invite that a nearby friend can scan directly off the screen, no typing needed. */
export function QrCodeImage({ value, size = 220 }: QrCodeImageProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDataUrl(null);
    QRCode.toDataURL(value, { width: size, margin: 1, color: { dark: "#000000", light: "#ffffff" } })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch(() => {
        // Leave dataUrl null — caller just shows nothing rather than a broken image.
      });
    return () => {
      cancelled = true;
    };
  }, [value, size]);

  return (
    <div style={{ width: size, height: size, borderRadius: 16, overflow: "hidden", background: "#fff" }}>
      {dataUrl && <img src={dataUrl} width={size} height={size} alt="QR" />}
    </div>
  );
}
