import { spawn } from "node:child_process";
import { dirname } from "node:path";
import { env } from "../../config/env";

export interface YtDlpResult {
  filePath: string;
  title: string;
  durationSeconds: number | null;
}

export interface YtDlpOptions {
  url: string;
  /** Absolute path without extension — yt-dlp fills in `.%(ext)s`. */
  outputBase: string;
  onProgress: (percentText: string, speedText: string) => void;
  signal: AbortSignal;
}

const WALL_CLOCK_TIMEOUT_MS = 30 * 60 * 1000;
// Marker + field separator for the single metadata line we ask yt-dlp to
// print. \x1f (unit separator) can't appear in a title or path, so parsing
// the line is unambiguous even for titles containing our marker text.
const META_MARKER = "IMPORTMETA";
const SEP = "\x1f";

/**
 * Runs yt-dlp for a single URL. Streams `download:<pct>|<speed>` progress
 * lines (via --progress-template) to `onProgress`, and prints one
 * `IMPORTMETA<sep><title><sep><duration><sep><path>` line once the file is
 * in place, so we learn the real output path/metadata without a second
 * process.
 */
export function runYtDlp(opts: YtDlpOptions): Promise<YtDlpResult> {
  return new Promise((resolve, reject) => {
    const args = [
      "--newline",
      "--no-playlist",
      "--no-warnings",
      "--progress-template",
      "download:%(progress._percent_str)s|%(progress._speed_str)s",
      "--print",
      `after_move:${META_MARKER}${SEP}%(title)s${SEP}%(duration)s${SEP}%(filepath)s`,
      "-f",
      "bestvideo+bestaudio/best",
      "--merge-output-format",
      "mp4",
      "-o",
      `${opts.outputBase}.%(ext)s`,
    ];
    if (env.ffmpegPath !== "ffmpeg") args.push("--ffmpeg-location", dirname(env.ffmpegPath));
    args.push(opts.url);

    const child = spawn(env.ytDlpPath, args, { stdio: ["ignore", "pipe", "pipe"] });

    let meta: YtDlpResult | null = null;
    let stdoutBuf = "";
    const stderrTail: string[] = [];

    const killTimer = setTimeout(() => child.kill("SIGKILL"), WALL_CLOCK_TIMEOUT_MS);
    const onAbort = () => child.kill("SIGKILL");
    opts.signal.addEventListener("abort", onAbort);

    const cleanup = () => {
      clearTimeout(killTimer);
      opts.signal.removeEventListener("abort", onAbort);
    };

    child.stdout.setEncoding("utf-8");
    child.stdout.on("data", (chunk: string) => {
      stdoutBuf += chunk;
      let nl: number;
      while ((nl = stdoutBuf.indexOf("\n")) !== -1) {
        const line = stdoutBuf.slice(0, nl).trim();
        stdoutBuf = stdoutBuf.slice(nl + 1);
        if (!line) continue;

        if (line.startsWith("download:")) {
          const [percent, speed] = line.slice("download:".length).split("|");
          opts.onProgress((percent ?? "").trim(), (speed ?? "").trim());
        } else if (line.startsWith(`${META_MARKER}${SEP}`)) {
          const [, title, duration, filePath] = line.split(SEP);
          const seconds = Number(duration);
          meta = {
            filePath: filePath?.trim() ?? "",
            title: title?.trim() || "video",
            durationSeconds: Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds) : null,
          };
        }
      }
    });

    child.stderr.setEncoding("utf-8");
    child.stderr.on("data", (chunk: string) => {
      for (const line of chunk.split("\n")) {
        const trimmed = line.trim();
        if (trimmed) stderrTail.push(trimmed);
      }
      if (stderrTail.length > 12) stderrTail.splice(0, stderrTail.length - 12);
    });

    child.on("error", (err) => {
      cleanup();
      reject(new Error(err.message.includes("ENOENT") ? "yt-dlp is not installed on the server" : err.message));
    });

    child.on("close", (code) => {
      cleanup();
      if (opts.signal.aborted) {
        reject(new Error("cancelled"));
        return;
      }
      if (code === 0 && meta?.filePath) {
        resolve(meta);
        return;
      }
      reject(new Error(summariseYtDlpError(stderrTail) || `yt-dlp exited with code ${code}`));
    });
  });
}

/** Turns yt-dlp's stderr spew into one short, user-facing reason. */
function summariseYtDlpError(stderrLines: string[]): string {
  const text = stderrLines.join(" ").toLowerCase();
  if (text.includes("unsupported url") || text.includes("no video formats")) return "this site isn't supported";
  if (text.includes("private") || text.includes("login required") || text.includes("sign in")) return "the video is private";
  if (text.includes("geo") && text.includes("restrict")) return "the video is geo-restricted";
  if (text.includes("404") || text.includes("not found") || text.includes("removed")) return "the video no longer exists";
  if (text.includes("timed out") || text.includes("timeout")) return "the download timed out";
  const lastError = [...stderrLines].reverse().find((l) => l.toLowerCase().startsWith("error"));
  return lastError ? lastError.replace(/^ERROR:\s*/i, "").slice(0, 180) : "";
}
