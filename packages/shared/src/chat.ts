export interface ChatMessage {
  id: string;
  fromUserId: number;
  fromName: string;
  text: string;
  sentAt: number;
}

export const CHAT_HISTORY_LIMIT = 50;
export const CHAT_MESSAGE_MAX_LENGTH = 500;
