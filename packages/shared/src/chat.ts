/** Snapshotted at send time, not a live reference — so editing or deleting
 *  the original later doesn't need to be joined/resolved by every client
 *  rendering the reply, and a reply preview keeps making sense even once
 *  the original has scrolled out of CHAT_HISTORY_LIMIT. */
export interface ChatReplyPreview {
  id: string;
  fromName: string;
  text: string;
}

export interface ChatMessage {
  id: string;
  fromUserId: number;
  fromName: string;
  text: string;
  sentAt: number;
  editedAt?: number;
  replyTo?: ChatReplyPreview;
}

export const CHAT_HISTORY_LIMIT = 50;
export const CHAT_MESSAGE_MAX_LENGTH = 500;
