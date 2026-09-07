import { randomUUID } from "node:crypto";
import type { TelegramUser } from "@stream/shared";
import { db } from "./database";

/** How long a pending login token stays usable. */
export const AUTH_REQUEST_TTL_MS = 10 * 60 * 1000;

interface AuthRequestRow {
  token: string;
  status: string;
  tg_user_json: string | null;
  created_at: number;
}

/** Mints a pending login token and clears out any that have expired. */
export function createAuthRequest(): string {
  const token = randomUUID();
  db.prepare(`INSERT INTO auth_requests (token, status, created_at) VALUES (?, 'pending', ?)`).run(token, Date.now());
  db.prepare(`DELETE FROM auth_requests WHERE created_at < ?`).run(Date.now() - AUTH_REQUEST_TTL_MS);
  return token;
}

export type AuthRequestState =
  | { status: "pending" }
  | { status: "expired" }
  | { status: "completed"; user: TelegramUser };

export function readAuthRequest(token: string): AuthRequestState {
  const row = db.prepare(`SELECT * FROM auth_requests WHERE token = ?`).get(token) as AuthRequestRow | undefined;
  if (!row || Date.now() - row.created_at > AUTH_REQUEST_TTL_MS) return { status: "expired" };
  if (row.status !== "completed" || !row.tg_user_json) return { status: "pending" };
  return { status: "completed", user: JSON.parse(row.tg_user_json) as TelegramUser };
}

/**
 * Called when the bot receives `/start <token>`. Returns false for a token
 * that doesn't exist, already expired, or was already used — so a leaked or
 * replayed deep link can't mint a second session.
 */
export function completeAuthRequest(token: string, user: TelegramUser): boolean {
  const row = db.prepare(`SELECT * FROM auth_requests WHERE token = ?`).get(token) as AuthRequestRow | undefined;
  if (!row || row.status === "completed") return false;
  if (Date.now() - row.created_at > AUTH_REQUEST_TTL_MS) return false;

  db.prepare(`UPDATE auth_requests SET status = 'completed', tg_user_json = ? WHERE token = ?`).run(
    JSON.stringify(user),
    token,
  );
  return true;
}

/** Consumed once a session has been issued for it. */
export function deleteAuthRequest(token: string): void {
  db.prepare(`DELETE FROM auth_requests WHERE token = ?`).run(token);
}
