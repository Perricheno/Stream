/**
 * telegram-ui's default Modal overlay tints using the page's own bg_color,
 * which on a very dark theme (near-black bg + near-black sheet) gives almost
 * no visible separation between the sheet and the page behind it. Use a flat
 * dark backdrop instead so the sheet always reads as a distinct layer.
 */
export function ModalBackdrop() {
  return <div style={{ position: "fixed", inset: 0, background: "rgba(0, 0, 0, 0.55)" }} />;
}
