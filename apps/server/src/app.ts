import express, { type Express } from "express";
import cors from "cors";
import { env } from "./config/env";
import { apiRoutes } from "./http/apiRoutes";

export function createApp(): Express {
  const app = express();
  app.use(cors({ origin: env.corsOrigin }));
  app.use(express.json());
  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });
  app.use("/api", apiRoutes);
  return app;
}
