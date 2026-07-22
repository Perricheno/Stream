import type { SocketUser } from "../socket/types";

declare global {
  namespace Express {
    interface Request {
      telegramUser?: SocketUser;
    }
  }
}

export {};
