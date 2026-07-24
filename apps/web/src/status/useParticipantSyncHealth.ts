import { useEffect, useState } from "react";
import type { RoomSocket } from "../socket/socketClient";

export interface ParticipantSyncHealth {
  driftSeconds: number;
  isBuffering: boolean;
  updatedAt: number;
}

/** Keyed by userId — fed by each client's own periodic sync:report (see
 *  useSyncedPlayback.ts), relayed back through the room including the
 *  sender, so this same map works for showing everyone's health regardless
 *  of whose screen it's read from. */
export function useParticipantSyncHealth(socket: RoomSocket): Record<number, ParticipantSyncHealth> {
  const [health, setHealth] = useState<Record<number, ParticipantSyncHealth>>({});

  useEffect(() => {
    const onStatus = (payload: { userId: number; driftSeconds: number; isBuffering: boolean; updatedAt: number }) => {
      setHealth((prev) => ({ ...prev, [payload.userId]: payload }));
    };
    socket.on("sync:status", onStatus);
    return () => {
      socket.off("sync:status", onStatus);
    };
  }, [socket]);

  return health;
}
