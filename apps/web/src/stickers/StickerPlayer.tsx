import { useEffect, useRef } from "react";
import lottie, { type AnimationItem } from "lottie-web";
import { STICKERS, type StickerId } from "./stickers.manifest";
import { loadTgsAnimation } from "./tgsLoader";

interface StickerPlayerProps {
  id: StickerId;
  size?: number;
  loop?: boolean;
  autoplay?: boolean;
  className?: string;
}

export function StickerPlayer({ id, size = 96, loop = true, autoplay = true, className }: StickerPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let animation: AnimationItem | undefined;
    let cancelled = false;

    loadTgsAnimation(STICKERS[id]).then((animationData) => {
      if (cancelled || !container) return;
      animation = lottie.loadAnimation({
        container,
        renderer: "svg",
        loop,
        autoplay,
        animationData,
      });
    });

    return () => {
      cancelled = true;
      animation?.destroy();
    };
  }, [id, loop, autoplay]);

  return <div ref={containerRef} className={className} style={{ width: size, height: size }} />;
}
