import { Router } from "express";
import { getVideo } from "../db/videoRepository";
import { openRange } from "../video/media/mediaStore";
import { verifyStreamToken } from "../video/media/streamToken";

/**
 * Serves the actual bytes of a library video with HTTP Range support (206
 * Partial Content), so seeking works from a plain <video> element.
 *
 * Mounted OUTSIDE requireTelegramAuth (a <video> tag can't send the app's
 * auth header) — access is carried by the `?token=` query param instead, a
 * short-lived signature minted by GET /api/videos/:id/stream-token once the
 * room-membership check has passed. This route only verifies that signature.
 */
export const videoStreamRoute = Router();

videoStreamRoute.get("/:id/stream", async (req, res) => {
  const claims = verifyStreamToken(typeof req.query.token === "string" ? req.query.token : undefined);
  if (!claims || claims.videoId !== req.params.id) {
    res.sendStatus(401);
    return;
  }

  const record = getVideo(req.params.id);
  if (!record || record.status !== "ready" || !record.filePath) {
    res.sendStatus(404);
    return;
  }

  const rangeHeader = req.headers.range;
  const range = await openRange(record.filePath, rangeHeader);
  if (!range) {
    res.sendStatus(rangeHeader ? 416 : 404);
    return;
  }

  res.status(rangeHeader ? 206 : 200);
  res.set({
    "Content-Type": "video/mp4",
    "Accept-Ranges": "bytes",
    "Content-Length": String(range.end - range.start + 1),
    "Cache-Control": "private, no-store",
  });
  if (rangeHeader) res.set("Content-Range", `bytes ${range.start}-${range.end}/${range.size}`);

  if (req.method === "HEAD") {
    range.stream.destroy();
    res.end();
    return;
  }

  range.stream.on("error", () => res.destroy());
  res.on("close", () => range.stream.destroy());
  range.stream.pipe(res);
});
