import type { AppLanguage, UserProfile } from "@stream/shared";
import { db } from "./database";

interface UserRow {
  user_id: number;
  first_name: string;
  photo_url: string | null;
  display_name: string;
  hide_profile: number;
  notifications_enabled: number;
  autoplay: number;
  language: string;
}

function rowToProfile(row: UserRow): UserProfile {
  return {
    userId: row.user_id,
    displayName: row.display_name,
    hideProfile: Boolean(row.hide_profile),
    notificationsEnabled: Boolean(row.notifications_enabled),
    autoplay: Boolean(row.autoplay),
    language: (row.language === "en" ? "en" : "ru") as AppLanguage,
  };
}

/** Creates the user row on first sight (e.g. first initData validation), leaving existing preferences untouched. */
export function upsertUser(user: { id: number; firstName: string; photoUrl?: string }): void {
  const now = Date.now();
  db.prepare(
    `INSERT INTO users (user_id, first_name, photo_url, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET first_name = excluded.first_name, photo_url = excluded.photo_url`,
  ).run(user.id, user.firstName, user.photoUrl ?? null, now, now);
}

export function getProfile(userId: number): UserProfile | undefined {
  const row = db.prepare(`SELECT * FROM users WHERE user_id = ?`).get(userId) as UserRow | undefined;
  return row ? rowToProfile(row) : undefined;
}

export function getUserBasics(userId: number): { firstName: string; photoUrl?: string } | undefined {
  const row = db.prepare(`SELECT first_name, photo_url FROM users WHERE user_id = ?`).get(userId) as
    | Pick<UserRow, "first_name" | "photo_url">
    | undefined;
  return row ? { firstName: row.first_name, photoUrl: row.photo_url ?? undefined } : undefined;
}

export interface ProfileUpdate {
  displayName?: string;
  hideProfile?: boolean;
  notificationsEnabled?: boolean;
  autoplay?: boolean;
  language?: AppLanguage;
}

export function updateProfile(userId: number, patch: ProfileUpdate): UserProfile | undefined {
  const current = getProfile(userId);
  if (!current) return undefined;

  const next: UserProfile = { ...current, ...patch };
  db.prepare(
    `UPDATE users SET display_name = ?, hide_profile = ?, notifications_enabled = ?, autoplay = ?, language = ?, updated_at = ?
     WHERE user_id = ?`,
  ).run(
    next.displayName,
    next.hideProfile ? 1 : 0,
    next.notificationsEnabled ? 1 : 0,
    next.autoplay ? 1 : 0,
    next.language,
    Date.now(),
    userId,
  );
  return next;
}
