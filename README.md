# Stream

A Telegram Mini App for watching video together — like Rave, but native to Telegram. React + Vite frontend styled with Telegram's own `telegram-ui` kit (the same design system @wallet uses), a Node/Socket.io backend for real-time playback sync, and Telegram animated stickers woven into the interface.

Room features: a custom minimal video-control overlay (own play/pause/seek/fullscreen UI, no native YouTube/HTML5 chrome), real-time text chat, sticker reactions, a room profile (display-name override + a "hide my profile" visibility toggle, in **Settings**), and a live **service status** indicator (latency, active rooms, connection state).

## Stack

- **apps/web** — React + TypeScript + Vite, `@telegram-apps/sdk-react` (theme, BackButton/MainButton/SecondaryButton, haptics, initData, CloudStorage) + `@telegram-apps/telegram-ui` (Section/Cell/List/Placeholder/Modal/...)
- **apps/server** — Express + Socket.io, in-memory room store, Telegram `initData` HMAC validation
- **packages/shared** — TypeScript types shared by both (socket event contracts, room/playback state)

## Requirements

- Node 20+
- pnpm 9 (`corepack enable` or `npm install -g pnpm`)
- A tunnel tool for testing inside real Telegram: [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) or [ngrok](https://ngrok.com/download)
- **For the "download a video from a link" feature:** `yt-dlp` and `ffmpeg`/`ffprobe` on the server. Not needed to run the sync core locally. See [`deploy/README.md`](deploy/README.md).

## Downloading videos

Links that aren't directly playable (tube sites, VK, Google Drive shares, a
page that only embeds a player) are handled by downloading the video to the
server with `yt-dlp` and then serving it as a plain file — which means full
playback sync works for them, unlike the old sync-less iframe fallback.

- **In the app:** paste such a link in the video picker (or the queue) — it
  starts an import and the player shows progress until it's ready.
- **Via the bot:** DM the bot a link or a video file; it replies with progress
  and a "watch together" button that opens a fresh room with that video loaded.
- Imported videos are private to whoever added them (the **Mine** tab in the
  picker); anyone in a room playing one can stream it regardless of who added
  it (a short-lived signed URL, minted per viewer).

Operational notes (yt-dlp update cadence, the optional Local Bot API Server
for >20 MB bot uploads, storage limits) are in [`deploy/README.md`](deploy/README.md).

## Getting started

```bash
pnpm install
cp apps/web/.env.example apps/web/.env
cp apps/server/.env.example apps/server/.env
pnpm dev
```

This runs the Vite dev server (`apps/web`, default `http://localhost:5173`) and the Socket.io server (`apps/server`, default `http://localhost:4000`) together.

`apps/server/.env` ships with `DEV_SKIP_AUTH=true` by default — the server accepts any connection and assigns each one a random throwaway identity, so you can test the whole join/sync pipeline in a plain browser before a real bot exists. **Never enable this in production.**

### Verifying the sync pipeline locally (no Telegram needed)

1. `pnpm dev`
2. Open `http://localhost:5173` in two browser tabs (or two windows).
3. In both, tap **Создать** in one tab, then copy that room code and **Войти по коду** in the other (room ids are just short random codes — no need for Telegram to test this part).
4. Paste the same YouTube link or a public HLS/mp4 test stream in either tab, then play/pause/seek — the other tab should follow within ~1–2 seconds.

## Running inside real Telegram

Telegram Mini Apps must be served over HTTPS, even in dev, so local testing goes through a tunnel. Only **one** public hostname is needed — Vite's dev server proxies `/socket.io` requests through to the backend (see `vite.config.ts`), so the Socket.io connection rides the same origin as the page instead of needing its own tunnel.

1. **Create a bot** — message [@BotFather](https://t.me/BotFather), send `/newbot`, follow the prompts. Copy the token it gives you into `apps/server/.env` as `BOT_TOKEN`, and set `DEV_SKIP_AUTH=false` once you're ready to test real auth (the socket auth middleware then validates every connection's `initData`).
2. **Tunnel the frontend only**: `cloudflared tunnel --url http://localhost:5173` (or `ngrok http 5173`), or route a named/persistent tunnel's public hostname to `localhost:5173`. Either way you end up with one HTTPS URL that reaches the Vite dev server (and, through its proxy, the backend too).
3. **Point the Mini App at it** — back in BotFather: `/mybots` → your bot → **Bot Settings** → **Menu Button** → set the URL to the tunnel URL from step 2 (or use `/newapp` to register it as a full Mini App).
4. Leave `VITE_SERVER_URL` in `apps/web/.env` empty — the client then connects same-origin, which the Vite proxy forwards to `localhost:4000`. Only set it if you deliberately want the backend on a separate origin (e.g. a real deployment where frontend and backend aren't behind the same proxy).
5. Set `VITE_BOT_USERNAME` in `apps/web/.env` to your bot's `@username` (without the `@`) so the in-room **"Поделиться комнатой"** button can build a working `t.me/<bot>?startapp=room_XXXX` deep link — opening that link auto-joins the room.
6. Open your bot's chat in Telegram (desktop or mobile), tap the menu button. You should see the real Telegram theme applied, the BackButton appear once you enter a room, and haptics fire on supported interactions (mobile only).
7. With `DEV_SKIP_AUTH=false`, confirm two real Telegram accounts (or the same account on two devices) joining the same room code stay in sync. Try tampering with `initData` manually (e.g. via devtools on a desktop Telegram client) to confirm the server rejects the connection.

## Known limitations (by design, for this scaffold)

- **Rooms are in-memory** — they reset whenever the server restarts, and don't persist across multiple server instances. Fine for a single-process deployment; would need Redis (or similar) to scale horizontally.
- **Stickers** — `apps/web/src/stickers/assets/*.tgs` are real Telegram animated stickers (gzip-compressed Lottie), mapped to app states in `stickers.manifest.ts` (e.g. `calling` for "connecting to room", `blocked` for join errors, `not-found` for an empty room list). Swap any of them for a different `.tgs` file at will — the loader (`tgsLoader.ts`) just expects gzip-compressed Lottie JSON.
- **Playback sync is last-write-wins**, not a full CRDT — correct and simple for the common case (one person scrubbing at a time), self-corrects within ~1–2s if two people act simultaneously. See `packages/shared/src/sync.ts`.
- **No persistence/accounts beyond initData** — a user's identity is whatever Telegram's initData says for that session; there's no separate database of users.

## Project layout

```
apps/web/src/
  telegram/     Telegram SDK bootstrap + hooks (theme, back/main button, haptics, initData, recent rooms, settings)
  socket/       Socket.io client + useRoomSocket (join/leave, room state, chat)
  player/       Unified video player (YouTube IFrame API + HTML5/hls.js), custom controls overlay, playback sync
  stickers/     .tgs (gzipped Lottie) loader + renderer
  status/       Service-status polling (/status) + indicator/panel
  screens/      Home, Room (toolbar/menu/chat), and Settings screens, built from @telegram-apps/telegram-ui

apps/server/src/
  telegram/     initData HMAC validation
  rooms/        In-memory room store
  socket/       Auth middleware + event handlers (join/leave, playback relay, reactions)

packages/shared/src/
  socket-events.ts   Client<->server event contracts
  room.ts, sync.ts   Room/playback state shared by both apps
```
