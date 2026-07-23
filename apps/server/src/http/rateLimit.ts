import type { NextFunction, Request, Response } from "express";

/**
 * Minimal per-user sliding-window limiter for the video search/resolve
 * routes — they burn paid-tier-adjacent API quota (YouTube/Google) and the
 * resolver makes outbound HTTP requests on the user's behalf, so one client
 * hammering them shouldn't be able to exhaust quota for everyone or turn the
 * server into an open fetch proxy.
 */
export function rateLimit(maxRequests: number, windowMs: number) {
  const hits = new Map<number, number[]>();

  // Entries only ever get touched (and cleaned) on that same user's next
  // request, never proactively — without this, `hits` grows by one key per
  // distinct user for the lifetime of the process. Sweeping periodically
  // keeps it bounded to actually-recent users; unref'd so it never keeps
  // the process alive on its own.
  const sweepTimer = setInterval(() => {
    const now = Date.now();
    for (const [userId, timestamps] of hits) {
      if (!timestamps.some((t) => now - t < windowMs)) hits.delete(userId);
    }
  }, windowMs);
  sweepTimer.unref();

  return (req: Request, res: Response, next: NextFunction): void => {
    const userId = req.telegramUser?.id;
    if (!userId) {
      next();
      return;
    }

    const now = Date.now();
    const timestamps = (hits.get(userId) ?? []).filter((t) => now - t < windowMs);
    if (timestamps.length >= maxRequests) {
      res.status(429).json({ error: "too many requests, slow down" });
      return;
    }
    timestamps.push(now);
    hits.set(userId, timestamps);
    next();
  };
}
