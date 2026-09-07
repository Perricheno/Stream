import { Router } from "express";
import { searchYouTube } from "../video/searchYouTube";
import { searchSites } from "../video/searchSites";
import { resolveVideoUrl } from "../video/resolveVideoUrl";
import { rateLimit } from "./rateLimit";

export const videoRoutes = Router();

videoRoutes.get("/search", rateLimit(30, 60_000), async (req, res) => {
  const query = String(req.query.q ?? "").trim();
  if (!query) {
    res.status(400).json({ error: "missing q" });
    return;
  }
  try {
    res.json(await searchYouTube(query));
  } catch (err) {
    console.error(`[video/search] "${query}" failed:`, err);
    res.status(503).json({ error: err instanceof Error ? err.message : "search failed" });
  }
});

videoRoutes.get("/search-sites", rateLimit(30, 60_000), async (req, res) => {
  const query = String(req.query.q ?? "").trim();
  if (!query) {
    res.status(400).json({ error: "missing q" });
    return;
  }
  try {
    res.json(await searchSites(query));
  } catch (err) {
    console.error(`[video/search-sites] "${query}" failed:`, err);
    res.status(503).json({ error: err instanceof Error ? err.message : "search failed" });
  }
});

videoRoutes.post("/resolve", rateLimit(30, 60_000), async (req, res) => {
  const url = String((req.body as Record<string, unknown>)?.url ?? "").trim();
  if (!url) {
    res.status(400).json({ error: "missing url" });
    return;
  }
  let source;
  try {
    source = await resolveVideoUrl(url);
  } catch (err) {
    // Errors here are expected for a lot of ordinary input (private/invalid
    // hosts, unreachable pages, timeouts) — logged so a genuine bug doesn't
    // just look identical to "no video found" with zero trace of why.
    console.error(`[video/resolve] "${url}" failed:`, err);
    source = null;
  }
  if (source) {
    res.json({ source });
    return;
  }
  // Nothing directly playable, but a real link — hand it to the download
  // subsystem (POST /api/videos/import), which covers tube sites, VK, etc.
  if (/^https?:\/\//i.test(url)) {
    res.json({ needsDownload: true });
    return;
  }
  res.status(422).json({ error: "couldn't find a playable video at that link" });
});
