import { useEffect, useRef, useState } from "react";
import type { VideoSource } from "@stream/shared";
import { api } from "../api/apiClient";
import { getStreamUrl, getVideo, type LibraryVideo } from "../api/videoApi";

export interface LibraryVideoState {
  status: "loading" | "downloading" | "ready" | "failed";
  progressPercent: number;
  title?: string;
  errorMessage?: string;
  /** Set once status is "ready" — a `file` source pointing at the signed
   *  stream URL, ready to hand straight to Html5PlayerAdapter. */
  fileSource?: Extract<VideoSource, { type: "file" }>;
}

const POLL_INTERVAL_MS = 2000;

/**
 * Turns a `library` VideoSource into something playable: polls the import
 * job while it's still downloading, and once the row is ready resolves a
 * short-lived signed stream URL (minted per viewer — the access check lives
 * at token-issue time, see the server's videos routes). Re-mints the URL if
 * the token 401s mid-playback (expired).
 */
export function useLibraryVideo(videoId: string): LibraryVideoState {
  const [state, setState] = useState<LibraryVideoState>({ status: "loading", progressPercent: 0 });
  const cancelled = useRef(false);

  useEffect(() => {
    // Called with "" for every non-library source (hooks can't be
    // conditional) — do nothing then, so we don't poll the API pointlessly.
    if (!videoId) return;

    cancelled.current = false;
    setState({ status: "loading", progressPercent: 0 });

    let timer: ReturnType<typeof setTimeout> | undefined;

    const resolveReady = async (video: LibraryVideo) => {
      try {
        const { token } = await api.get<{ token: string }>(`/videos/${videoId}/stream-token`);
        if (cancelled.current) return;
        setState({
          status: "ready",
          progressPercent: 100,
          title: video.title,
          fileSource: { type: "file", url: getStreamUrl(videoId, token), kind: "mp4" },
        });
      } catch {
        if (!cancelled.current) setState({ status: "failed", progressPercent: 100, errorMessage: "stream unavailable" });
      }
    };

    const tick = async () => {
      try {
        const video = await getVideo(videoId);
        if (cancelled.current) return;

        if (video.status === "ready") {
          void resolveReady(video);
          return;
        }
        if (video.status === "failed") {
          setState({
            status: "failed",
            progressPercent: video.progressPercent,
            title: video.title,
            errorMessage: video.errorMessage ?? undefined,
          });
          return;
        }
        setState({ status: "downloading", progressPercent: video.progressPercent, title: video.title });
        timer = setTimeout(tick, POLL_INTERVAL_MS);
      } catch {
        if (!cancelled.current) timer = setTimeout(tick, POLL_INTERVAL_MS);
      }
    };

    void tick();

    return () => {
      cancelled.current = true;
      if (timer) clearTimeout(timer);
    };
  }, [videoId]);

  return state;
}
