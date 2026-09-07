import { createWriteStream } from "node:fs";
import { unlink } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { assertPublicHttpUrl } from "../ssrfGuard";

export interface DriveDownloadOptions {
  fileId: string;
  /** Absolute path (with extension) to write the file to. */
  outputPath: string;
  onProgress: (percent: number, receivedBytes: number) => void;
  /** Refuse the download once it exceeds this many bytes. */
  maxBytes: number;
  signal: AbortSignal;
}

export interface DriveDownloadResult {
  filePath: string;
  title: string;
}

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const MAX_HOPS = 5;

/**
 * Downloads a Google Drive file shared as "anyone with the link". Drive
 * gates larger files behind a "couldn't scan for viruses" interstitial —
 * this follows that: the first response is an HTML page carrying a `confirm`
 * token (and a `uuid`), which we resubmit to get the actual bytes. Private
 * files (which would need OAuth) are out of scope and surface as a clear
 * "the file isn't shared publicly" error.
 *
 * Every URL — including redirect targets and the confirm resubmission — goes
 * through the same SSRF guard the link resolver uses.
 */
export async function downloadFromDrive(opts: DriveDownloadOptions): Promise<DriveDownloadResult> {
  const cookies = new Map<string, string>();
  let url = `https://drive.usercontent.google.com/download?id=${encodeURIComponent(opts.fileId)}&export=download`;

  for (let hop = 0; hop < MAX_HOPS; hop++) {
    await assertPublicHttpUrl(url);
    const res = await fetch(url, {
      redirect: "manual",
      signal: opts.signal,
      headers: {
        "User-Agent": BROWSER_UA,
        Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
        ...(cookies.size ? { Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join("; ") } : {}),
      },
    });

    for (const raw of res.headers.getSetCookie?.() ?? []) {
      const [pair] = raw.split(";");
      const eq = pair.indexOf("=");
      if (eq > 0) cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) throw new Error("the file isn't shared publicly");
      url = new URL(location, url).toString();
      continue;
    }
    if (!res.ok) throw new Error(res.status === 404 ? "the file no longer exists" : "the file isn't shared publicly");

    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("text/html")) {
      const html = await res.text();
      const next = confirmUrlFromInterstitial(html);
      if (!next) throw new Error("the file isn't shared publicly");
      url = next;
      continue;
    }

    if (!res.body) throw new Error("empty response from Google Drive");
    const title = filenameFromDisposition(res.headers.get("content-disposition")) ?? "video";
    const declared = Number(res.headers.get("content-length")) || 0;
    if (declared && declared > opts.maxBytes) throw new Error("the file is too large");

    await streamToFile(res.body, opts, declared);
    return { filePath: opts.outputPath, title };
  }

  throw new Error("too many redirects from Google Drive");
}

async function streamToFile(body: ReadableStream<Uint8Array>, opts: DriveDownloadOptions, declaredBytes: number): Promise<void> {
  let received = 0;
  const meter = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      received += chunk.byteLength;
      if (received > opts.maxBytes) {
        controller.error(new Error("the file is too large"));
        return;
      }
      opts.onProgress(declaredBytes ? Math.min(99, (received / declaredBytes) * 100) : 0, received);
      controller.enqueue(chunk);
    },
  });

  try {
    const piped = body.pipeThrough(meter) as unknown as import("node:stream/web").ReadableStream<Uint8Array>;
    await pipeline(Readable.fromWeb(piped), createWriteStream(opts.outputPath), { signal: opts.signal });
  } catch (err) {
    await unlink(opts.outputPath).catch(() => undefined);
    throw err;
  }
}

function confirmUrlFromInterstitial(html: string): string | null {
  // Newer interstitial: a <form action="https://drive.usercontent.google.com/download"> with hidden inputs.
  const action = /<form[^>]+action="([^"]+)"/i.exec(html)?.[1];
  if (action) {
    const params = new URLSearchParams();
    for (const input of html.matchAll(/<input[^>]+type="hidden"[^>]*>/gi)) {
      const name = /name="([^"]+)"/i.exec(input[0])?.[1];
      const value = /value="([^"]*)"/i.exec(input[0])?.[1];
      if (name) params.set(name, decodeHtml(value ?? ""));
    }
    if (params.has("id") && params.has("confirm")) return `${decodeHtml(action)}?${params.toString()}`;
  }
  // Older interstitial: a direct "&confirm=XXX" link.
  const link = /href="(\/uc\?export=download[^"]+)"/i.exec(html)?.[1];
  if (link) return new URL(decodeHtml(link), "https://drive.google.com").toString();
  return null;
}

function filenameFromDisposition(header: string | null): string | null {
  if (!header) return null;
  const star = /filename\*=(?:UTF-8'')?([^;]+)/i.exec(header)?.[1];
  if (star) {
    try {
      return decodeURIComponent(star.trim().replace(/^"|"$/g, ""));
    } catch {
      /* fall through */
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(header)?.[1];
  return plain ? plain.trim() : null;
}

function decodeHtml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}
