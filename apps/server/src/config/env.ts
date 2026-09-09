import "dotenv/config";
import { resolve } from "node:path";

export const env = {
  port: Number(process.env.PORT ?? 4000),
  botToken: process.env.BOT_TOKEN ?? "",
  botUsername: process.env.BOT_USERNAME ?? "",
  /** Tunnel's public HTTPS origin, no trailing slash. When set, the bot registers a Telegram webhook there instead of long polling. */
  publicUrl: (process.env.PUBLIC_URL ?? "").replace(/\/+$/, ""),
  corsOrigin: process.env.CORS_ORIGIN ?? "*",
  /** Skips initData HMAC validation — for local dev only, before a real bot token exists. */
  devSkipAuth: process.env.DEV_SKIP_AUTH === "true",
  dbPath: resolve(process.env.DB_PATH ?? "./data/stream.db"),
  /** youtube.com search — Google Cloud Console → enable "YouTube Data API v3". */
  youtubeApiKey: process.env.YOUTUBE_API_KEY ?? "",
  /** General web search — Google Cloud Console API key + a Programmable Search
   *  Engine (https://programmablesearchengine.google.com) set to search the whole web. */
  googleApiKey: process.env.GOOGLE_API_KEY ?? "",
  googleCseId: process.env.GOOGLE_CSE_ID ?? "",
  /** Directory downloaded/imported video files are written to and streamed
   *  back from (see apps/server/src/video/media). Created automatically. */
  mediaDir: resolve(process.env.MEDIA_DIR ?? "./data/media"),
  /** Soft cap on the total size of the media directory — new downloads are
   *  refused (with a clear "out of space" error to the user) once the stored
   *  files add up to more than this. Default 100 GiB. */
  mediaMaxTotalBytes: Number(process.env.MEDIA_MAX_TOTAL_BYTES ?? 100 * 1024 ** 3),
  /** Executables the download subsystem shells out to. Overridable so a
   *  deploy can pin an absolute path / a venv shim without a PATH dependency. */
  ytDlpPath: process.env.YTDLP_PATH ?? "yt-dlp",
  ffmpegPath: process.env.FFMPEG_PATH ?? "ffmpeg",
  ffprobePath: process.env.FFPROBE_PATH ?? "ffprobe",
  /** Netscape-format cookies.txt for yt-dlp. YouTube (and some other sites)
   *  hard-block datacenter IPs with "confirm you're not a bot" unless the
   *  request carries a logged-in session — export cookies from a browser and
   *  drop the file here. Passed as `--cookies` only when the file exists, so
   *  a missing/blank value just means "no cookies". */
  ytDlpCookies: process.env.YTDLP_COOKIES ?? "/data/youtube-cookies.txt",
  /** HTTP base URL of a bgutil PO-token provider. YouTube returns no playable
   *  formats without a PO token; the provider (deploy/compose.yml's
   *  bgutil-provider sidecar) mints them. Blank = don't pass it (local dev
   *  without the sidecar). */
  ytDlpPotProviderUrl: process.env.YTDLP_POT_PROVIDER_URL ?? "",
  /** Persistent cache dir for yt-dlp — keeps the EJS n-challenge solver
   *  script (downloaded once from GitHub) across container restarts. */
  ytDlpCacheDir: process.env.YTDLP_CACHE_DIR ?? "/data/.ytdlp-cache",
  /**
   * yt-dlp format selector. The default deliberately caps at 1080p and
   * prefers H.264+AAC in MP4:
   *  - "best" without a cap picks whatever the site offers, which on YouTube
   *    means AV1 at absurd bitrates (a 2.5-minute clip came out at 2.7 GB —
   *    ~140 Mbit/s, which no connection here can stream in real time, so
   *    playback stalls into a slideshow);
   *  - H.264/AAC also needs no transcode to be browser-streamable, so the
   *    post-download step stays a cheap remux (see download/probe.ts).
   * Raise it (or drop the codec preference) only if the link between the
   * server and the viewers can actually carry it.
   */
  ytDlpFormat:
    process.env.YTDLP_FORMAT ??
    "bv*[height<=?1080][vcodec^=avc1]+ba[ext=m4a]/b[height<=?1080][vcodec^=avc1]/bv*[height<=?1080]+ba/b[height<=?1080]/b",
  /**
   * Browser to impersonate (curl_cffi TLS fingerprint) when a site rejects
   * yt-dlp outright — several tube sites answer the default client with a
   * flat HTTP 403 before any extraction happens. Only used on a retry after
   * such a failure, so the normal path (and YouTube's cookie/PO-token flow)
   * keeps using yt-dlp's own HTTP client. Blank disables the retry, for a
   * host without curl_cffi installed.
   */
  ytDlpImpersonate: process.env.YTDLP_IMPERSONATE ?? "chrome",
  /** System Chromium (installed via apt, not Playwright's own bundled
   *  download — see Dockerfile) used only as a last-resort fallback when an
   *  extractor breaks because a site now builds its player data client-side
   *  in JS (see download/browserResolve.ts). Blank disables the fallback
   *  entirely, for a host without it installed. */
  chromiumPath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
  /** Base URL for Bot API calls. Point this at a self-hosted Local Bot API
   *  Server (https://github.com/tdlib/telegram-bot-api) to lift the 20 MB
   *  getFile download limit up to 2000 MB — needed for pulling
   *  "highest quality" videos users send straight to the bot as a file. */
  botApiBaseUrl: (process.env.TELEGRAM_BOT_API_BASE_URL ?? "https://api.telegram.org").replace(/\/+$/, ""),
  /** The bot's numeric id, i.e. Telegram Login's `client_id`/OIDC `aud` — from
   *  @BotFather's Bot Settings > Web Login, once a domain is registered there.
   *  Required for the standalone-website login flow (see telegram/validateTelegramLoginToken.ts);
   *  the Mini App path (initData) doesn't need it. */
  telegramBotId: process.env.TELEGRAM_BOT_ID ?? "",
  /** Signs the app's own session cookie issued after a successful Telegram
   *  Login (see http/session.ts) — unrelated to BOT_TOKEN. Any long random
   *  string; rotating it invalidates every existing web session. */
  sessionSecret: process.env.SESSION_SECRET ?? "",
};
