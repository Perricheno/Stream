import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@telegram-apps/telegram-ui/dist/styles.css";
import "./styles/global.css";
import { bootstrapTelegram } from "./telegram/init";
import { App } from "./App";

bootstrapTelegram();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
