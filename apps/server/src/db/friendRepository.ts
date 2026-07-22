import type { FriendSummary } from "@stream/shared";
import { db } from "./database";

function canonicalPair(a: number, b: number): [number, number] {
  return a < b ? [a, b] : [b, a];
}

export function areFriends(a: number, b: number): boolean {
  const [userA, userB] = canonicalPair(a, b);
  const row = db.prepare(`SELECT 1 FROM friendships WHERE user_a = ? AND user_b = ?`).get(userA, userB);
  return Boolean(row);
}

/** Friendship is symmetric — stored once per canonical pair. Returns false if they were already friends (no-op). */
export function addFriendship(a: number, b: number): boolean {
  if (a === b) return false;
  const [userA, userB] = canonicalPair(a, b);
  if (areFriends(userA, userB)) return false;
  db.prepare(`INSERT INTO friendships (user_a, user_b, created_at) VALUES (?, ?, ?)`).run(userA, userB, Date.now());
  return true;
}

export function listFriends(userId: number): FriendSummary[] {
  const rows = db
    .prepare(
      `SELECT u.user_id as userId, u.first_name as firstName, u.photo_url as photoUrl
       FROM friendships f
       JOIN users u ON u.user_id = CASE WHEN f.user_a = ? THEN f.user_b ELSE f.user_a END
       WHERE f.user_a = ? OR f.user_b = ?
       ORDER BY u.first_name COLLATE NOCASE`,
    )
    .all(userId, userId, userId) as { userId: number; firstName: string; photoUrl: string | null }[];

  return rows.map((row) => ({ userId: row.userId, firstName: row.firstName, photoUrl: row.photoUrl ?? undefined }));
}
