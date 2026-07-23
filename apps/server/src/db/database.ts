import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { env } from "../config/env";

const dbDir = dirname(env.dbPath);
if (!existsSync(dbDir)) mkdirSync(dbDir, { recursive: true });

export const db = new DatabaseSync(env.dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    user_id INTEGER PRIMARY KEY,
    first_name TEXT NOT NULL,
    photo_url TEXT,
    display_name TEXT NOT NULL DEFAULT '',
    hide_profile INTEGER NOT NULL DEFAULT 0,
    notifications_enabled INTEGER NOT NULL DEFAULT 1,
    autoplay INTEGER NOT NULL DEFAULT 1,
    language TEXT NOT NULL DEFAULT 'ru',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS friendships (
    user_a INTEGER NOT NULL,
    user_b INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (user_a, user_b)
  );

  -- The composite PK above only indexes the user_a side of
  -- "WHERE user_a = ? OR user_b = ?" (see friendRepository.ts) — this covers
  -- the user_b side so both directions of a friend lookup stay indexed.
  CREATE INDEX IF NOT EXISTS idx_friendships_user_b ON friendships(user_b);
`);
