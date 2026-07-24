import { useEffect, useRef, useState } from "react";
import { miniApp } from "@telegram-apps/sdk-react";
import {
  CHAT_HISTORY_LIMIT,
  type ChatMessage,
  type Participant,
  type QueueItem,
  type RoomStatePayload,
  type VideoSource,
} from "@stream/shared";
import { socket } from "./socketClient";

export type RoomConnectionStatus = "idle" | "connecting" | "joined" | "error" | "kicked";

/** How long to wait for a reply to the liveness probe on resume (see
 *  onVisibilityChange below) before assuming the connection is a zombie and
 *  forcing a hard reconnect. */
const VISIBILITY_LIVENESS_TIMEOUT_MS = 3000;

export interface RoomSocketState {
  status: RoomConnectionStatus;
  room: RoomStatePayload | null;
  error: string | null;
  /** The server's own record of who you are — see JoinRoomResult's doc
   *  comment for why this, not the Telegram SDK's own initData signal, is
   *  the one to use for "is this me" checks (host status, own messages,
   *  etc.) throughout the room. */
  yourUserId: number | null;
}

/**
 * Connects to the room's socket namespace, joins `roomId`, and keeps `room`
 * in sync. The joining user's display name/visibility come from their
 * server-side profile (see apps/server's db/userRepository.ts), looked up
 * during `room:join` — nothing profile-related needs to be sent from here.
 *
 * Re-joins on every successful (re)connection, not just the first — Telegram
 * suspends the Mini App's webview when it's backgrounded (screen lock,
 * switching chats), which can drop the socket. socket.io-client reconnects
 * the transport automatically, but a bare reconnect doesn't re-add the user
 * to the server's in-memory room (that's keyed by socket id, which changes
 * on reconnect) — without this, the app would sit in a stale "joined" state
 * showing a dead room. Re-running `room:join` on "connect" (which fires for
 * every reconnect too) replaces local state with the server's fresh state.
 */
export function useRoomSocket(roomId: string | undefined): RoomSocketState {
  const [state, setState] = useState<RoomSocketState>({ status: "idle", room: null, error: null, yourUserId: null });
  const joinedRoomRef = useRef<string | null>(null);

  useEffect(() => {
    if (!roomId) return;

    setState({ status: "connecting", room: null, error: null, yourUserId: null });

    const join = () => {
      socket.emit("room:join", { roomId }, (res) => {
        if (res.ok && res.state) {
          joinedRoomRef.current = roomId;
          setState({ status: "joined", room: res.state, error: null, yourUserId: res.yourUserId ?? null });
        } else {
          setState({ status: "error", room: null, error: res.error ?? "Failed to join room", yourUserId: null });
        }
      });
    };

    const onRoomState = (room: RoomStatePayload) => {
      setState((prev) => ({ ...prev, room }));
    };
    const onParticipants = (participants: Participant[]) => {
      setState((prev) => (prev.room ? { ...prev, room: { ...prev.room, participants } } : prev));
    };
    const onSourceChanged = (payload: { source: VideoSource }) => {
      setState((prev) => (prev.room ? { ...prev, room: { ...prev.room, source: payload.source } } : prev));
    };
    const onQueueUpdated = (payload: { queue: QueueItem[] }) => {
      setState((prev) => (prev.room ? { ...prev, room: { ...prev.room, queue: payload.queue } } : prev));
    };
    const onChatMessage = (message: ChatMessage) => {
      setState((prev) =>
        prev.room
          ? { ...prev, room: { ...prev.room, messages: [...prev.room.messages, message].slice(-CHAT_HISTORY_LIMIT) } }
          : prev,
      );
    };
    const onChatMessageUpdated = (message: ChatMessage) => {
      setState((prev) =>
        prev.room
          ? { ...prev, room: { ...prev.room, messages: prev.room.messages.map((m) => (m.id === message.id ? message : m)) } }
          : prev,
      );
    };
    const onChatMessageDeleted = ({ id }: { id: string }) => {
      setState((prev) =>
        prev.room ? { ...prev, room: { ...prev.room, messages: prev.room.messages.filter((m) => m.id !== id) } } : prev,
      );
    };
    const onError = (payload: { code: string; message: string }) => {
      setState({ status: "error", room: null, error: payload.message, yourUserId: null });
    };
    const onKicked = () => {
      joinedRoomRef.current = null;
      setState({ status: "kicked", room: null, error: null, yourUserId: null });
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
        yourUserId: null,
      });
    };

    // Backstop for long backgrounding: Telegram can suspend the webview for
    // minutes, well past socket.io's own `reconnectionAttempts` budget, so
    // by the time the user returns the client may have already given up
    // reconnecting on its own. Forcing a fresh `connect()` on resume is a
    // no-op if already connected, but restarts the attempt if not.
    //
    // `socket.connected` on its own isn't trustworthy here: a phone's OS can
    // suspend the network stack while backgrounded without the client
    // noticing right away, leaving a "zombie" connection that still reports
    // connected but is actually dead until socket.io's own heartbeat times
    // out (tens of seconds — see apps/server/src/index.ts's ping settings).
    // During that window nothing the user does actually reaches the server,
    // which looked exactly like "video won't play, buttons don't work" but
    // was really "the room state you're computing from is stale and the
    // server never got the memo". Probing with a round trip and forcing a
    // hard reconnect if it doesn't answer promptly catches this immediately
    // on resume instead of waiting out that timeout passively.
    const checkConnectionLiveness = () => {
      if (!socket.connected) {
        socket.connect();
        return;
      }
      let answered = false;
      socket.emit("time:sync", { clientSentAt: Date.now() }, () => {
        answered = true;
      });
      setTimeout(() => {
        if (!answered) {
          socket.disconnect();
          socket.connect();
        }
      }, VISIBILITY_LIVENESS_TIMEOUT_MS);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") checkConnectionLiveness();
    };
    // Belt and suspenders alongside the browser's own Page Visibility API:
    // Telegram's isActive is the client's own purpose-built signal for "the
    // Mini App just came back to the foreground" and can fire in cases
    // where the generic visibilitychange event doesn't quite line up with a
    // specific Telegram client's actual minimize/restore behavior.
    const offMiniAppActive = miniApp.isActive.sub((isActive) => {
      if (isActive) checkConnectionLiveness();
    });

    socket.on("connect", join);
    socket.on("room:state", onRoomState);
    socket.on("room:participants", onParticipants);
    socket.on("playback:source-changed", onSourceChanged);
    socket.on("queue:updated", onQueueUpdated);
    socket.on("chat:message", onChatMessage);
    socket.on("chat:message-updated", onChatMessageUpdated);
    socket.on("chat:message-deleted", onChatMessageDeleted);
    socket.on("room:error", onError);
    socket.on("room:kicked", onKicked);
    socket.on("connect_error", onConnectError);
    socket.io.on("reconnect_failed", onReconnectFailed);
    document.addEventListener("visibilitychange", onVisibilityChange);

    socket.connect();

    return () => {
      socket.off("connect", join);
      socket.off("room:state", onRoomState);
      socket.off("room:participants", onParticipants);
      socket.off("playback:source-changed", onSourceChanged);
      socket.off("queue:updated", onQueueUpdated);
      socket.off("chat:message", onChatMessage);
      socket.off("chat:message-updated", onChatMessageUpdated);
      socket.off("chat:message-deleted", onChatMessageDeleted);
      socket.off("room:error", onError);
      socket.off("room:kicked", onKicked);
      socket.off("connect_error", onConnectError);
      socket.io.off("reconnect_failed", onReconnectFailed);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      offMiniAppActive();
      if (joinedRoomRef.current) {
        socket.emit("room:leave");
        joinedRoomRef.current = null;
      }
      socket.disconnect();
    };
  }, [roomId]);

  return state;
}
