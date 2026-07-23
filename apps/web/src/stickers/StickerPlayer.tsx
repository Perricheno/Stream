import { useEffect, useRef } from "react";
import type { AnimationItem } from "lottie-web";
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

    // lottie-web (the rendering engine) is loaded on demand alongside the
    // sticker data, rather than eagerly at module scope — Home renders
    // StickerPlayer unconditionally, so an eager import would ship the whole
    // animation engine in the main bundle before any sticker is even shown.
    Promise.all([import("lottie-web"), loadTgsAnimation(STICKERS[id])]).then(([{ default: lottie }, animationData]) => {
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
