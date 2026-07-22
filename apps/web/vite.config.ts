import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Telegram loads the Mini App inside a WebView; it must be reachable over
// HTTPS, which in local dev comes from a tunnel (see README). `host: true`
// lets Vite accept connections proxied through that tunnel, and
// `allowedHosts: true` avoids Vite's host-header check rejecting the
// tunnel's public hostname.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    allowedHosts: true,
    // Lets the app reach the Socket.io server through the same tunnel
    // hostname as the frontend, so only one public URL is needed — the
    // client connects same-origin (see socketClient.ts) unless
    // VITE_SERVER_URL is set explicitly.
    proxy: {
      "/socket.io": {
        target: "http://localhost:4000",
        ws: true,
        changeOrigin: true,
      },
      "/status": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
});
