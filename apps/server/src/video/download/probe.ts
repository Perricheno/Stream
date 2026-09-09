import { spawn } from "node:child_process";
import { unlink } from "node:fs/promises";
import { env } from "../../config/env";

interface ProbeInfo {
  container: string;
  videoCodec: string | null;
  audioCodec: string | null;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
}

// Codecs a plain <video> element plays across the browsers this app targets.
const HTML5_VIDEO_CODECS = new Set(["h264", "vp8", "vp9", "av1"]);
const HTML5_AUDIO_CODECS = new Set(["aac", "mp3", "opus", "vorbis", "flac"]);

function run(bin: string, args: string[], signal: AbortSignal): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const onAbort = () => child.kill("SIGKILL");
    signal.addEventListener("abort", onAbort);
    child.stdout.on("data", (c) => (stdout += c));
    child.stderr.on("data", (c) => (stderr += c));
    child.on("error", (err) => {
      signal.removeEventListener("abort", onAbort);
      reject(new Error(err.message.includes("ENOENT") ? `${bin} is not installed on the server` : err.message));
    });
    child.on("close", (code) => {
      signal.removeEventListener("abort", onAbort);
      resolve({ code: code ?? -1, stdout, stderr });
    });
  });
}

export async function probe(filePath: string, signal: AbortSignal): Promise<ProbeInfo> {
  const { code, stdout } = await run(
    env.ffprobePath,
    ["-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", filePath],
    signal,
  );
  if (code !== 0) throw new Error("could not read the downloaded file");

  const data = JSON.parse(stdout) as {
    format?: { format_name?: string; duration?: string };
    streams?: { codec_type?: string; codec_name?: string; width?: number; height?: number }[];
  };
  const streams = data.streams ?? [];
  const duration = Number(data.format?.duration);
  const videoStream = streams.find((s) => s.codec_type === "video");

  return {
    container: (data.format?.format_name ?? "").toLowerCase(),
    videoCodec: videoStream?.codec_name?.toLowerCase() ?? null,
    audioCodec: streams.find((s) => s.codec_type === "audio")?.codec_name?.toLowerCase() ?? null,
    durationSeconds: Number.isFinite(duration) && duration > 0 ? Math.round(duration) : null,
    width: videoStream?.width ?? null,
    height: videoStream?.height ?? null,
  };
}

export interface StreamableResult {
  /** Always `outputMp4Path` — a browser-streamable MP4. The input file has
   *  been removed by the time this returns. */
  path: string;
  durationSeconds: number | null;
  /** True if a full re-encode ran (a genuinely incompatible codec), false if
   *  it was just a container/faststart rewrite. */
  transcoded: boolean;
}

async function ffmpeg(args: string[], signal: AbortSignal): Promise<{ ok: boolean; stderr: string }> {
  const { code, stderr } = await run(env.ffmpegPath, ["-y", ...args], signal);
  return { ok: code === 0, stderr };
}

/**
 * Makes sure the file is something a browser can stream and seek: an MP4
 * with HTML5-friendly codecs and its moov atom at the front. yt-dlp usually
 * delivers compatible codecs already, so the common path is just a cheap
 * `-c copy` faststart rewrite (no re-encode). A genuinely incompatible codec
 * (HEVC / AC-3 / …) is the only thing that forces a real transcode.
 */
export async function ensureStreamable(inputPath: string, outputMp4Path: string, signal: AbortSignal): Promise<StreamableResult> {
  const info = await probe(inputPath, signal);
  const videoOk = info.videoCodec === null || HTML5_VIDEO_CODECS.has(info.videoCodec);
  const audioOk = info.audioCodec === null || HTML5_AUDIO_CODECS.has(info.audioCodec);
  const needsTranscode = !videoOk || !audioOk;

  const transcodeArgs = [
    "-i", inputPath,
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
    "-c:a", "aac", "-b:a", "192k",
    "-movflags", "+faststart", outputMp4Path,
  ];

  let transcoded = false;
  let result: { ok: boolean; stderr: string };

  if (needsTranscode) {
    result = await ffmpeg(transcodeArgs, signal);
    transcoded = true;
  } else {
    // Compatible codecs: just rewrite the container with the index up front.
    result = await ffmpeg(["-i", inputPath, "-c", "copy", "-movflags", "+faststart", outputMp4Path], signal);
    if (!result.ok) result = await ffmpeg(["-i", inputPath, "-c", "copy", outputMp4Path], signal);
    if (!result.ok) {
      // A stream copy shouldn't fail on a probe-clean file, but if it does,
      // a real transcode is the last resort rather than a failed import.
      result = await ffmpeg(transcodeArgs, signal);
      transcoded = true;
    }
  }

  if (!result.ok) {
    await unlink(outputMp4Path).catch(() => undefined);
    throw new Error(`could not convert the video (${result.stderr.trim().split("\n").pop() ?? "ffmpeg failed"})`);
  }

  await unlink(inputPath).catch(() => undefined);
  const durationSeconds =
    info.durationSeconds ?? (await probe(outputMp4Path, signal).catch(() => null))?.durationSeconds ?? null;
  return { path: outputMp4Path, durationSeconds, transcoded };
}
