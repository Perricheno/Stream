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

  -- Downloaded / imported videos, one row per import job. A row is created
  -- immediately with status='downloading' and progressed in place by the
  -- download subsystem (see apps/server/src/video/download) until it lands
  -- on status='ready' (file_path populated) or 'failed' (error_message set).
  CREATE TABLE IF NOT EXISTS videos (
    id TEXT PRIMARY KEY,
    added_by_user_id INTEGER NOT NULL,
    source_type TEXT NOT NULL,        -- 'youtube' | 'gdrive' | 'telegram_upload' | 'direct_url'
    source_url TEXT,
    title TEXT NOT NULL DEFAULT '',
    file_path TEXT,
    thumbnail_path TEXT,
    duration_seconds INTEGER,
    status TEXT NOT NULL DEFAULT 'downloading', -- 'downloading' | 'ready' | 'failed'
    progress_percent INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_videos_status ON videos(status);
  CREATE INDEX IF NOT EXISTS idx_videos_added_by ON videos(added_by_user_id);

  -- Browser login without Telegram's Login Widget: the site mints a token,
  -- sends the visitor to t.me/<bot>?start=<token>, and the bot marks the row
  -- completed once they press Start. The page polls until then. Needs no
  -- registered domain, which the widget/OIDC flow does.
  CREATE TABLE IF NOT EXISTS auth_requests (
    token TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'pending',   -- 'pending' | 'completed'
    tg_user_json TEXT,
    created_at INTEGER NOT NULL
  );
`);
