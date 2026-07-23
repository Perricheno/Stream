import { useEffect, useState } from "react";

/**
 * Tracks the actual visible viewport height in real time (window.visualViewport),
 * which shrinks correctly when the on-screen keyboard opens. Telegram's own
 * --tg-viewport-height CSS variable is meant to do the same thing, but it
 * updates via a round-trip through the native bridge — laggy/stuttery enough
 * on some devices that the Room screen's fixed-position layout would fight
 * with the keyboard's own resize animation, leaving the focused input
 * (chat message box, video search box) stuck half-covered. Returns null
 * where visualViewport isn't supported, so callers fall back to the CSS var.
 */
export function useVisualViewportHeight(): number | null {
  const [height, setHeight] = useState<number | null>(() => window.visualViewport?.height ?? null);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => setHeight(vv.height);
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    update();
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  return height;
}
