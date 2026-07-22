import express, { type Express } from "express";
import cors from "cors";
import { env } from "./config/env";

export function createApp(): Express {
  const app = express();
  app.use(cors({ origin: env.corsOrigin }));
  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });
  return app;
}
