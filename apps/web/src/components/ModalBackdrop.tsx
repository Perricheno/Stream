import { forwardRef } from "react";

/**
 * telegram-ui's default Modal overlay tints using the page's own bg_color,
 * which on a very dark theme (near-black bg + near-black sheet) gives almost
 * no visible separation between the sheet and the page behind it. Use a flat
 * dark backdrop instead so the sheet always reads as a distinct layer.
 *
 * Must be forwardRef — vaul (the drawer library telegram-ui's Modal is built
 * on) attaches a ref to whatever renders in the overlay slot, the same way
 * its own default `ModalOverlay` does; a plain function component here
 * throws "Function components cannot be given refs".
 */
export const ModalBackdrop = forwardRef<HTMLDivElement>((props, ref) => (
  <div ref={ref} {...props} style={{ position: "fixed", inset: 0, background: "rgba(0, 0, 0, 0.55)" }} />
));
ModalBackdrop.displayName = "ModalBackdrop";
