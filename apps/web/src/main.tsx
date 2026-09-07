import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@telegram-apps/telegram-ui/dist/styles.css";
import "./styles/global.css";
import { bootstrapTelegram } from "./telegram/init";
import { captureRawInitData } from "./telegram/rawInitData";
import { applyPerformanceClassMotionPreference } from "./telegram/detectPerformanceClass";
import { registerAdblock } from "./adblock/registerAdblock";
import { App } from "./App";

// A documented issue on some real Telegram clients (missing Object.hasOwn on
// older engines breaks the SDK's own validator — see
// github.com/Telegram-Mini-Apps/telegram-apps/issues/683) makes init() throw
// and fall back to a mocked identity for UI purposes. Capturing the real raw
// initData before that fallback can overwrite the URL hash keeps the socket
// connection (and everything keyed off "who am I") on the real one — see
// rawInitData.ts's doc comment.
if (!Object.hasOwn) {
  Object.hasOwn = (obj: object, prop: PropertyKey) => Object.prototype.hasOwnProperty.call(obj, prop);
}
captureRawInitData();
applyPerformanceClassMotionPreference();
bootstrapTelegram();
registerAdblock();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
