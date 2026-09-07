import { useCallback, useEffect, useRef, useState } from "react";
import { Placeholder, Snackbar } from "@telegram-apps/telegram-ui";
import { shareURL } from "@telegram-apps/sdk-react";
import type { ChatReplyPreview, VideoSource } from "@stream/shared";
import { useBackButton } from "../../telegram/useBackButton";
import { useClosingConfirmation } from "../../telegram/useClosingConfirmation";
import { useDisableVerticalSwipes } from "../../telegram/useDisableVerticalSwipes";
import { useVisualViewportHeight } from "../../telegram/useVisualViewportHeight";
import { useHapticFeedback } from "../../telegram/useHapticFeedback";
import { useProfile } from "../../telegram/ProfileContext";
import { confirmAction } from "../../telegram/confirmAction";
import { useTranslation } from "../../i18n/useTranslation";
import { useRoomSocket } from "../../socket/useRoomSocket";
import { socket } from "../../socket/socketClient";
import { useSyncedPlayback } from "../../player/useSyncedPlayback";
import { useParticipantSyncHealth } from "../../status/useParticipantSyncHealth";
import { VideoPlayer } from "../../player/VideoPlayer";
import { StickerPlayer } from "../../stickers/StickerPlayer";
import { SettingsPanel } from "../Settings/SettingsPanel";
import { FriendsPanel } from "../Friends/FriendsPanel";
import { ParticipantsBar } from "./ParticipantsBar";
import { ParticipantsModal } from "./ParticipantsModal";
import { VideoSourcePicker } from "./VideoSourcePicker";
import { QueuePanel } from "./QueuePanel";
import { RoomQrModal } from "./RoomQrModal";
import { RoomToolbar } from "./RoomToolbar";
import { ChatPanel } from "./ChatPanel";
import styles from "./RoomScreen.module.css";

const BOT_USERNAME = import.meta.env.VITE_BOT_USERNAME as string | undefined;

function ChatBubbleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M4 4h16v12H7l-3 3V4z" />
    </svg>
  );
}

interface RoomScreenProps {
  roomId: string;
  onExit: () => void;
  /** Set when the room was opened from the bot's "watch together" deep link —
   *  the just-downloaded library video to load as the source once we're host. */
  initialVideoId?: string;
}

export function RoomScreen({ roomId, onExit, initialVideoId }: RoomScreenProps) {
  const { status, room, error, yourUserId } = useRoomSocket(roomId);
  const { profile } = useProfile();
  const { t } = useTranslation();
  const haptics = useHapticFeedback();
  const synced = useSyncedPlayback(socket, room?.playback ?? null);
  const syncHealth = useParticipantSyncHealth(socket);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [friendsOpen, setFriendsOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [participantsOpen, setParticipantsOpen] = useState(false);
  const visualViewportHeight = useVisualViewportHeight();
  const [pickingSource, setPickingSource] = useState(false);
  const [hostToast, setHostToast] = useState<string | null>(null);
  const [isVideoFullscreen, setIsVideoFullscreen] = useState(false);
  const [chatSidebarOpen, setChatSidebarOpen] = useState(false);
  const [chatUnreadCount, setChatUnreadCount] = useState(0);
  const handleFullscreenChange = useCallback((value: boolean) => {
    setIsVideoFullscreen(value);
    if (!value) setChatSidebarOpen(false);
  }, []);
  const autoplayedSourceRef = useRef<string | null>(null);
  const lastParticipantCountRef = useRef<number | null>(null);
  const lastMessageCountRef = useRef<number | null>(null);
  const lastHostIdRef = useRef<number | null>(null);
  const isHostRef = useRef(false);
  const currentHostId = room?.participants.find((p) => p.isHost)?.userId ?? null;
  const isHost = currentHostId !== null && currentHostId === yourUserId;

  useEffect(() => {
    isHostRef.current = isHost;
  }, [isHost]);

  // Toast when the host changes (e.g. the previous host disconnected and the
  // server auto-promoted the next participant) — otherwise this could go
  // unnoticed since nothing else in the UI calls it out.
  useEffect(() => {
    const previous = lastHostIdRef.current;
    lastHostIdRef.current = currentHostId;
    if (previous === null || previous === currentHostId || currentHostId === null) return;
    const newHost = room?.participants.find((p) => p.userId === currentHostId);
    if (newHost) setHostToast(t("hostTransferred").replace("{name}", newHost.firstName));
  }, [currentHostId, room?.participants, t]);

  useEffect(() => {
    if (!room?.source || profile?.autoplay === false) return;
    const sourceKey = JSON.stringify(room.source);
    if (autoplayedSourceRef.current === sourceKey) return;
    autoplayedSourceRef.current = sourceKey;
    let cancelled = false;
    let attempts = 0;
    // A single fixed-delay attempt silently lost the autoplay if the player
    // (YouTube/Vimeo especially) took longer than that to finish its
    // handshake — the one .play() call landed as a no-op and nothing ever
    // retried it, leaving the video stuck paused at 0:00 with no error.
    const tryPlay = () => {
      if (cancelled) return;
      if (synced.playerRef.current?.isReady()) {
        if (isHostRef.current) {
          // See startPlaybackNow's doc comment — reports this to the server
          // immediately instead of waiting for the player's own native "play"
          // event, which for YouTube/Vimeo only fires once their iframe
          // finishes a multi-second load handshake.
          synced.startPlaybackNow(0);
        } else {
          // A non-host participant's own autoplay must never "establish"
          // playback state the way startPlaybackNow does — this effect fires
          // for every participant (so everyone's video actually starts, since
          // nothing autoplays on its own), but only the host's action is the
          // room's canonical start. For anyone else, the sync layer's own
          // initial-sync effect (using the room's real state) is what
          // decides the correct position; this just needs to get the local
          // player moving, not report anything.
          synced.playerRef.current.play();
        }
        return;
      }
      attempts += 1;
      // Generous: a `library` source's player only mounts once its import
      // finishes and a stream token is fetched, which is easily longer than
      // the few seconds a YouTube/Vimeo iframe handshake needs. Giving up at
      // ~10s meant a just-downloaded video sat paused at 0:00 with nobody
      // having pressed anything.
      if (attempts >= 300) return; // ~60s
      setTimeout(tryPlay, 200);
    };
    tryPlay();
    return () => {
      cancelled = true;
    };
  }, [room?.source, profile?.autoplay, synced.playerRef, synced.startPlaybackNow]);

  // Chat is always visible docked under the video normally, so there's
  // nothing to badge — but the fullscreen slide-in panel (see below) can be
  // closed while messages keep arriving, and that's the one case where a
  // "something new happened" signal is actually needed.
  useEffect(() => {
    const count = room?.messages.length ?? 0;
    const previous = lastMessageCountRef.current;
    lastMessageCountRef.current = count;
    if (previous === null || count <= previous) return;
    if (isVideoFullscreen && !chatSidebarOpen) setChatUnreadCount((n) => n + (count - previous));
  }, [room?.messages.length, isVideoFullscreen, chatSidebarOpen]);

  useEffect(() => {
    if (chatSidebarOpen) setChatUnreadCount(0);
  }, [chatSidebarOpen]);

  // Somebody else's app went to the background, or they left — the room was
  // paused for everyone (see playback:request-pause). Say so, otherwise the
  // video just stops with no explanation.
  useEffect(() => {
    const onPausedBy = ({ userId, userName, reason }: { userId: number; userName: string; reason: string }) => {
      if (userId === yourUserId) return;
      setHostToast(t(reason === "left" ? "pausedByLeft" : "pausedByAway").replace("{name}", userName));
    };
    socket.on("playback:paused-by", onPausedBy);
    return () => {
      socket.off("playback:paused-by", onPausedBy);
    };
  }, [yourUserId, t]);

  const handleBack = useCallback(async () => {
    const confirmed = await confirmAction(
      t("leaveRoomDescription"),
      t("leaveRoomTitle"),
      t("leaveRoom"),
    );
    if (confirmed) onExit();
  }, [onExit, t]);
  useBackButton(true, handleBack);
  // Covers closing via Telegram's own X/swipe-down — handleBack above only
  // intercepts in-app navigation (our custom back button), not that.
  useClosingConfirmation(true);
  // The video controls' own vertical swipe (volume) would otherwise compete
  // with Telegram's native swipe-to-minimize for the same gesture.
  useDisableVerticalSwipes(true);

  const inviteUrl = BOT_USERNAME ? `https://t.me/${BOT_USERNAME}?startapp=room_${roomId}` : null;

  const handleShare = useCallback(() => {
    if (!inviteUrl) {
      haptics.notify("error");
      return;
    }
    shareURL(inviteUrl, t("shareRoomText"));
  }, [inviteUrl, haptics, t]);

  useEffect(() => {
    if (status === "joined") haptics.notify("success");
    if (status === "error") haptics.notify("error");
  }, [status, haptics]);

  // Notify (haptic) when participants come and go, if the user opted in.
  useEffect(() => {
    if (!room) return;
    const count = room.participants.length;
    const previous = lastParticipantCountRef.current;
    lastParticipantCountRef.current = count;
    if (previous === null || previous === count || profile?.notificationsEnabled === false) return;
    haptics.selectionChanged();
  }, [room?.participants.length, profile?.notificationsEnabled, haptics, room]);

  const changeSource = useCallback((source: VideoSource) => {
    socket.emit("playback:change-source", { source });
    setPickingSource(false);
  }, []);

  // Opened via the bot's "watch together" deep link: as soon as we're the
  // host of this fresh room and nothing's playing yet, load the downloaded
  // video. Runs once.
  const initialVideoAppliedRef = useRef(false);
  useEffect(() => {
    if (initialVideoAppliedRef.current || !initialVideoId) return;
    if (status !== "joined" || !isHost || room?.source) return;
    initialVideoAppliedRef.current = true;
    changeSource({ type: "library", videoId: initialVideoId });
  }, [initialVideoId, status, isHost, room?.source, changeSource]);

  const sendChat = useCallback((text: string, replyTo?: ChatReplyPreview) => {
    socket.emit("chat:send", { text, replyTo });
  }, []);

  const editChat = useCallback((id: string, text: string) => {
    socket.emit("chat:edit", { id, text });
  }, []);

  const deleteChat = useCallback((id: string) => {
    socket.emit("chat:delete", { id });
  }, []);

  const kickParticipant = useCallback((targetUserId: number) => {
    socket.emit("room:kick", { targetUserId });
  }, []);

  // Only the host's client drives end-of-video handling — if every
  // participant's player fired this, they'd race to pop the same queue item.
  // Pause the room at the end position first: with an empty queue,
  // queue:advance is a server-side no-op, so without this the room state
  // stays isPlaying:true forever and every client's sync layer keeps trying
  // to seek to an ever-growing "expected" position past the end of the video.
  const handleEnded = useCallback(() => {
    if (!isHostRef.current) return;
    synced.onPause(synced.playerRef.current?.getCurrentTime() ?? 0);
    socket.emit("queue:advance");
  }, [synced.onPause, synced.playerRef]);

  const addToQueue = useCallback((source: VideoSource) => {
    socket.emit("queue:add", { source });
  }, []);

  const removeFromQueue = useCallback((itemId: string) => {
    socket.emit("queue:remove", { itemId });
  }, []);

  if (status === "idle" || status === "connecting") {
    return (
      <Placeholder header={t("connecting")} description={`${t("roomCode")} ${roomId}`}>
        <StickerPlayer id="calling" size={120} />
      </Placeholder>
    );
  }

  if (status === "kicked") {
    return (
      <Placeholder header={t("kickedTitle")} description={t("kickedDescription")}>
        <StickerPlayer id="blocked" size={120} />
      </Placeholder>
    );
  }

  if (status === "error" || !room) {
    return (
      <Placeholder header={t("joinErrorTitle")} description={error ?? t("joinErrorRetry")}>
        <StickerPlayer id="sad" size={120} />
      </Placeholder>
    );
  }

  return (
    <div className={styles.screen} style={visualViewportHeight ? { height: visualViewportHeight } : undefined}>
      <div className={styles.header}>
        <RoomToolbar
          roomId={roomId}
          onShare={handleShare}
          hasSource={Boolean(room.source) && !pickingSource}
          onChangeSource={() => setPickingSource(true)}
          onOpenSettings={() => setSettingsOpen(true)}
          onInviteFriend={() => setFriendsOpen(true)}
          onOpenQueue={() => setQueueOpen(true)}
          queueCount={room.queue.length}
          onShowQr={() => (inviteUrl ? setQrOpen(true) : haptics.notify("error"))}
          onLeave={handleBack}
        />
        <ParticipantsBar participants={room.participants} onOpen={() => setParticipantsOpen(true)} />
      </div>

      <div className={styles.body}>
        <div className={styles.videoArea}>
          {room.source && !pickingSource ? (
            <div key={JSON.stringify(room.source)} style={{ animation: "fadeIn 0.25s ease" }}>
              <VideoPlayer
                source={room.source}
                playerRef={synced.playerRef}
                suppressed={synced.suppressed}
                onPlay={synced.onPlay}
                onPause={synced.onPause}
                onSeek={synced.onSeek}
                onEnded={handleEnded}
                onBuffering={synced.onBuffering}
                isHost={isHost}
                onFullscreenChange={handleFullscreenChange}
                shrinkForChat={chatSidebarOpen}
              />
            </div>
          ) : (
            <div key="picker" style={{ animation: "fadeIn 0.2s ease" }}>
              <VideoSourcePicker onSelect={changeSource} />
            </div>
          )}
        </div>

        <ChatPanel
          className={styles.chatFill}
          messages={room.messages}
          currentUserId={yourUserId ?? undefined}
          onSend={sendChat}
          onEdit={editChat}
          onDelete={deleteChat}
        />
      </div>

      {/* Our own fullscreen mode covers the whole viewport (including where
          the docked/landscape chat column would be), so chat becomes an
          on-demand slide-in panel reachable via a floating toggle instead.
          The toggle only exists while the panel is CLOSED — once open, the
          panel's own close button (see ChatPanel's onClose) is the way
          back, so the two never fight over the same corner of the screen. */}
      {isVideoFullscreen && !chatSidebarOpen && (
        <button
          type="button"
          className={styles.chatToggle}
          onClick={() => setChatSidebarOpen(true)}
          aria-label="Показать чат"
        >
          <ChatBubbleIcon />
          {chatUnreadCount > 0 && <span className={styles.chatToggleBadge}>{chatUnreadCount > 9 ? "9+" : chatUnreadCount}</span>}
        </button>
      )}
      {isVideoFullscreen && chatSidebarOpen && (
        <ChatPanel
          className={styles.chatOverlay}
          messages={room.messages}
          currentUserId={yourUserId ?? undefined}
          onSend={sendChat}
          onEdit={editChat}
          onDelete={deleteChat}
          onClose={() => setChatSidebarOpen(false)}
        />
      )}

      <ParticipantsModal
        open={participantsOpen}
        onOpenChange={setParticipantsOpen}
        participants={room.participants}
        currentUserId={yourUserId ?? undefined}
        isHost={isHost}
        onKick={kickParticipant}
        onInvite={() => setFriendsOpen(true)}
        syncHealth={syncHealth}
      />
      <FriendsPanel open={friendsOpen} onOpenChange={setFriendsOpen} roomId={roomId} />
      <SettingsPanel open={settingsOpen} onOpenChange={setSettingsOpen} />
      <QueuePanel
        open={queueOpen}
        onOpenChange={setQueueOpen}
        queue={room.queue}
        isHost={isHost}
        onAdd={addToQueue}
        onRemove={removeFromQueue}
      />
      {hostToast && (
        <Snackbar onClose={() => setHostToast(null)} duration={3000}>
          {hostToast}
        </Snackbar>
      )}
      {inviteUrl && <RoomQrModal open={qrOpen} onOpenChange={setQrOpen} roomId={roomId} inviteUrl={inviteUrl} />}
    </div>
  );
}
