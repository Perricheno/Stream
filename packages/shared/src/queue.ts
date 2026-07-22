import type { VideoSource } from "./room";

export interface QueueItem {
  id: string;
  source: VideoSource;
  addedByUserId: number;
  addedByName: string;
}

export const QUEUE_MAX_LENGTH = 50;
