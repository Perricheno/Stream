const USER_AGENT_PATTERN = /Telegram-Android\/[\d.]+ \([^;]+; Android [^;]+; SDK \d+; (LOW|AVERAGE|HIGH)\)/;

/** Telegram's Android client appends its own performance-class estimate to
 *  the User-Agent (see the "Additional Data in User-Agent" section of the
 *  Mini Apps docs) — undefined on every other platform (iOS, desktop,
 *  plain browser), where there's nothing to trim. */
export function detectPerformanceClass(): "LOW" | "AVERAGE" | "HIGH" | undefined {
  const match = USER_AGENT_PATTERN.exec(navigator.userAgent);
  return match?.[1] as "LOW" | "AVERAGE" | "HIGH" | undefined;
}

/** Stamps `data-reduced-motion` on <html> for low-end Android devices — see
 *  global.css's blanket animation/transition override. Telegram's own
 *  design guidelines explicitly recommend cutting animations on
 *  low-performance hardware to keep the UI smooth. */
export function applyPerformanceClassMotionPreference(): void {
  if (detectPerformanceClass() === "LOW") {
    document.documentElement.dataset.reducedMotion = "true";
  }
}
