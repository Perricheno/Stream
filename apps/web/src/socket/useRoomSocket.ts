import { useEffect, useRef, useState } from "react";
import type { Participant, RoomStatePayload, VideoSource } from "@stream/shared";
import { socket } from "./socketClient";

export type RoomConnectionStatus = "idle" | "connecting" | "joined" | "error";

export interface RoomSocketState {
  status: RoomConnectionStatus;
  room: RoomStatePayload | null;
  error: string | null;
}

/** Connects to the room's socket namespace, joins `roomId`, and keeps `room` in sync. */
export function useRoomSocket(roomId: string | undefined): RoomSocketState {
  const [state, setState] = useState<RoomSocketState>({ status: "idle", room: null, error: null });
  const joinedRoomRef = useRef<string | null>(null);

  useEffect(() => {
    if (!roomId) return;

    setState({ status: "connecting", room: null, error: null });
    socket.connect();

    const onRoomState = (room: RoomStatePayload) => {
      setState((prev) => ({ ...prev, room }));
    };
    const onParticipants = (participants: Participant[]) => {
      setState((prev) => (prev.room ? { ...prev, room: { ...prev.room, participants } } : prev));
    };
    const onSourceChanged = (payload: { source: VideoSource }) => {
      setState((prev) => (prev.room ? { ...prev, room: { ...prev.room, source: payload.source } } : prev));
    };
    const onError = (payload: { code: string; message: string }) => {
      setState({ status: "error", room: null, error: payload.message });
    };

    socket.on("room:state", onRoomState);
    socket.on("room:participants", onParticipants);
    socket.on("playback:source-changed", onSourceChanged);
    socket.on("room:error", onError);

    socket.emit("room:join", { roomId }, (res) => {
      if (res.ok && res.state) {
        joinedRoomRef.current = roomId;
        setState({ status: "joined", room: res.state, error: null });
      } else {
        setState({ status: "error", room: null, error: res.error ?? "Failed to join room" });
      }
    });

    return () => {
      socket.off("room:state", onRoomState);
      socket.off("room:participants", onParticipants);
      socket.off("playback:source-changed", onSourceChanged);
      socket.off("room:error", onError);
      if (joinedRoomRef.current) {
        socket.emit("room:leave");
        joinedRoomRef.current = null;
      }
      socket.disconnect();
    };
  }, [roomId]);

  return state;
}
