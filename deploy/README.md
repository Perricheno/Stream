# Deploying the download subsystem

The watch-together core (Socket.io sync, the Mini App) runs as before. This
folder covers the extra server-side pieces the "download a video from a link"
feature needs.

## 0. Coolify / Docker (recommended)

The repo-root [`Dockerfile`](../Dockerfile) builds the server image with
`ffmpeg` and `yt-dlp` already inside it — nothing to install on the host.

In Coolify:

1. New Resource → your repo → build pack **Dockerfile** (path `./Dockerfile`).
2. **Persistent storage:** mount a volume at `/data` (the image puts both
   `stream.db` and `MEDIA_DIR` there, so both survive redeploys).
3. **Environment** (see the table in §5, plus the bot vars from
   `apps/server/.env.example`): `BOT_TOKEN`, `BOT_USERNAME`, `TELEGRAM_BOT_ID`,
   `SESSION_SECRET`, `DEV_SKIP_AUTH=false`, and — once a public hostname points
   at this service — `PUBLIC_URL=https://<that-host>` and
   `CORS_ORIGIN=https://<that-host>`. Leave `PUBLIC_URL` empty to run the bot
   on long polling (no inbound hostname needed).
4. Port: the container listens on `4000`.
5. Point a Cloudflare tunnel hostname at the service, then set that hostname
   as the Mini App URL in @BotFather (`/mybots` → bot → Bot Settings → Menu
   Button / `/newapp`) and add it under **Web Login** for the site-login flow.

`yt-dlp` still needs refreshing on a schedule (§2) — rebuild/redeploy the
image weekly (its Dockerfile always pulls the latest `yt-dlp`), or add the
cron below inside the container.

## 1. System dependencies (bare-metal / non-Docker)

The server shells out to two external tools. Install them on the host:

```bash
# ffmpeg / ffprobe — remuxing + the rare transcode of an incompatible codec
apt-get install -y ffmpeg

# yt-dlp — the actual downloader (YouTube, VK, xHamster, SpankBang, PornHub,
# and ~1800 other sites, each with its own extractor).
# Install into a venv or with pipx so it can be updated independently of the OS:
python3 -m pip install -U yt-dlp
```

If any of these aren't on `PATH`, point at them explicitly in
`apps/server/.env`: `YTDLP_PATH`, `FFMPEG_PATH`, `FFPROBE_PATH`.

## 2. Keep yt-dlp updated — this is not optional

Sites change their players and anti-bot measures constantly; extractors break
and get fixed upstream within days. A yt-dlp that's a month old will silently
fail on a growing share of links. Refresh it on a schedule:

```cron
# /etc/cron.d/refresh-yt-dlp  — Sundays at 04:00
0 4 * * 0  root  python3 -m pip install -U yt-dlp >> /var/log/yt-dlp-update.log 2>&1
```

(Adjust the interpreter/path to match how you installed it — `pipx upgrade
yt-dlp`, a venv's pip, etc.)

## 3. Local Bot API Server (for files sent to the bot)

Only needed if you want users to be able to send a video **file** straight to
the bot (as opposed to a link). The public Bot API caps that at 20 MB. See
[`telegram-bot-api.compose.yml`](./telegram-bot-api.compose.yml) — bring it up,
then set `TELEGRAM_BOT_API_BASE_URL=http://localhost:8081` in the server env.
Downloading from a link (the common case) does **not** need this.

## 4. Storage

Downloads land in `MEDIA_DIR` (default `apps/server/data/media`, which is
git-ignored). `-f bestvideo+bestaudio/best` means full-quality files — a
150 GB disk fills faster than you'd expect.

- `MEDIA_MAX_TOTAL_BYTES` (default 100 GiB) is a soft cap: once stored files
  exceed it, new imports fail fast with an "out of storage" message to the
  user instead of the disk silently filling and writes starting to error.
- There is currently no automatic eviction — prune `MEDIA_DIR` (and the
  matching `videos` rows) manually, or lower the cap, as needed. Watch free
  space with your normal host monitoring.

## 5. Env summary (server)

| Variable | Purpose | Default |
| --- | --- | --- |
| `MEDIA_DIR` | Where video files are stored | `./data/media` |
| `MEDIA_MAX_TOTAL_BYTES` | Soft storage cap | `107374182400` (100 GiB) |
| `YTDLP_PATH` / `FFMPEG_PATH` / `FFPROBE_PATH` | Tool locations | on `PATH` |
| `TELEGRAM_BOT_API_BASE_URL` | Local Bot API Server, for >20 MB bot file uploads | `https://api.telegram.org` |
