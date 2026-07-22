import { useEffect, useRef, useState } from "react";
import { CHAT_HISTORY_LIMIT, type ChatMessage, type Participant, type RoomStatePayload, type VideoSource } from "@stream/shared";
import { socket } from "./socketClient";

export type RoomConnectionStatus = "idle" | "connecting" | "joined" | "error";

export interface RoomSocketState {
  status: RoomConnectionStatus;
  room: RoomStatePayload | null;
  error: string | null;
}

export interface RoomProfile {
  displayName?: string;
  hideProfile?: boolean;
}

/** Connects to the room's socket namespace, joins `roomId`, and keeps `room` in sync. */
export function useRoomSocket(roomId: string | undefined, profile?: RoomProfile): RoomSocketState {
  const [state, setState] = useState<RoomSocketState>({ status: "idle", room: null, error: null });
  const joinedRoomRef = useRef<string | null>(null);
  const profileRef = useRef(profile);
  profileRef.current = profile;

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
    const onChatMessage = (message: ChatMessage) => {
      setState((prev) =>
        prev.room
          ? { ...prev, room: { ...prev.room, messages: [...prev.room.messages, message].slice(-CHAT_HISTORY_LIMIT) } }
          : prev,
      );
    };
    const onError = (payload: { code: string; message: string }) => {
      setState({ status: "error", room: null, error: payload.message });
    };
    let lastConnectErrorMessage = "";
    const onConnectError = (err: Error) => {
      lastConnectErrorMessage = err.message;
    };
    const onReconnectFailed = () => {
      setState({
        status: "error",
        room: null,
        error: lastConnectErrorMessage
          ? `Не удалось подключиться: ${lastConnectErrorMessage}`
          : "Не удалось подключиться к серверу",
      });
    };

    socket.on("room:state", onRoomState);
    socket.on("room:participants", onParticipants);
    socket.on("playback:source-changed", onSourceChanged);
    socket.on("chat:message", onChatMessage);
    socket.on("room:error", onError);
    socket.on("connect_error", onConnectError);
    socket.io.on("reconnect_failed", onReconnectFailed);

    socket.emit(
      "room:join",
      { roomId, displayName: profileRef.current?.displayName, hideProfile: profileRef.current?.hideProfile },
      (res) => {
        if (res.ok && res.state) {
          joinedRoomRef.current = roomId;
          setState({ status: "joined", room: res.state, error: null });
        } else {
          setState({ status: "error", room: null, error: res.error ?? "Failed to join room" });
        }
      },
    );

    return () => {
      socket.off("room:state", onRoomState);
      socket.off("room:participants", onParticipants);
      socket.off("playback:source-changed", onSourceChanged);
      socket.off("chat:message", onChatMessage);
      socket.off("room:error", onError);
      socket.off("connect_error", onConnectError);
      socket.io.off("reconnect_failed", onReconnectFailed);
      if (joinedRoomRef.current) {
        socket.emit("room:leave");
        joinedRoomRef.current = null;
      }
      socket.disconnect();
    };
  }, [roomId]);

  return state;
}
