import { useCallback, useEffect, useState } from "react";

interface DocumentPictureInPicture {
  requestWindow(options?: { width?: number; height?: number }): Promise<Window>;
  window: Window | null;
}

declare global {
  interface Window {
    documentPictureInPicture?: DocumentPictureInPicture;
  }
}

export function isDocumentPictureInPictureSupported(): boolean {
  return typeof window !== "undefined" && "documentPictureInPicture" in window;
}

/** The floating window starts out with no stylesheets of its own — content
 *  rendered into it (via a React portal, see VideoPlayer.tsx) would
 *  otherwise show up completely unstyled. Cloning every <link rel=stylesheet>
 *  and <style> tag already in the main document across covers both Vite dev
 *  (CSS modules injected as <style> tags) and a production build (a <link>
 *  to the built CSS file) without needing to know which. */
function copyStylesInto(pipWindow: Window): void {
  const nodes = document.querySelectorAll<HTMLLinkElement | HTMLStyleElement>("link[rel='stylesheet'], style");
  nodes.forEach((node) => {
    pipWindow.document.head.append(node.cloneNode(true));
  });
}

export interface UseDocumentPictureInPictureResult {
  /** Chromium-only today (no Firefox/Safari) — callers should fall back to
   *  the standard per-adapter <video> PiP (Html5PlayerAdapter) when false. */
  supported: boolean;
  isActive: boolean;
  pipWindow: Window | null;
  /** Opens the floating window if not already active, closes it otherwise.
   *  Must be called synchronously from a user gesture (a click handler) —
   *  browsers require that for requestWindow() to succeed. */
  toggle: () => void;
}

/**
 * Wraps the Document Picture-in-Picture API — unlike the standard
 * <video>-only requestPictureInPicture(), this floats an entire DOM subtree
 * above every window, so "float above all windows" works for YouTube/Vimeo's
 * iframe players too, not just direct video files (see PlayerHandle's own
 * requestPictureInPicture, which only the HTML5 adapter can implement).
 */
export function useDocumentPictureInPicture(): UseDocumentPictureInPictureResult {
  const [pipWindow, setPipWindow] = useState<Window | null>(null);
  const supported = isDocumentPictureInPictureSupported();

  useEffect(() => {
    if (!pipWindow) return;
    // Fires when the floating window is closed however that happens (its
    // own close button, Alt+F4, the toggle button below calling close()) —
    // the one place that needs to know "we're back to normal" regardless of
    // which of those actually triggered it.
    const onPageHide = () => setPipWindow(null);
    pipWindow.addEventListener("pagehide", onPageHide);
    return () => pipWindow.removeEventListener("pagehide", onPageHide);
  }, [pipWindow]);

  const toggle = useCallback(() => {
    if (pipWindow) {
      pipWindow.close();
      return;
    }
    if (!supported || !window.documentPictureInPicture) return;
    void window.documentPictureInPicture.requestWindow({ width: 480, height: 270 }).then((win) => {
      copyStylesInto(win);
      setPipWindow(win);
    });
  }, [supported, pipWindow]);

  return { supported, isActive: pipWindow !== null, pipWindow, toggle };
}
