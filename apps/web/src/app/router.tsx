import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { useLaunchParams } from "@telegram-apps/sdk-react";
import { Placeholder, Spinner } from "@telegram-apps/telegram-ui";
import { HomeScreen } from "../screens/Home/HomeScreen";

// Room pulls in socket.io-client, hls.js, the YouTube adapter and lottie-web —
// keep it out of the initial bundle so Home (the more frequently hit screen)
// stays fast to load.
const loadRoomScreen = () => import("../screens/Room/RoomScreen").then((m) => ({ default: m.RoomScreen }));
const RoomScreen = lazy(loadRoomScreen);

const START_PARAM_ROOM_PREFIX = "room_";
const START_PARAM_ADD_FRIEND_PREFIX = "addfriend_";
const START_PARAM_VIDEO_PREFIX = "video_";

/** Lets a shared room link (`t.me/<bot>?startapp=room_XXXX`) open straight into that room. */
function readRoomIdFromStartParam(startParam: string | undefined): string | null {
  if (!startParam?.startsWith(START_PARAM_ROOM_PREFIX)) return null;
  return startParam.slice(START_PARAM_ROOM_PREFIX.length).toUpperCase();
}

/** Lets the bot's "watch together" button (`t.me/<bot>?startapp=video_<id>`)
 *  open a fresh room with that just-downloaded library video preloaded. */
function readVideoIdFromStartParam(startParam: string | undefined): string | null {
  if (!startParam?.startsWith(START_PARAM_VIDEO_PREFIX)) return null;
  const id = startParam.slice(START_PARAM_VIDEO_PREFIX.length);
  return /^[\w-]{6,64}$/.test(id) ? id : null;
}

function generateRoomId(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

/** Lets a personal "add me" link (`t.me/<bot>?startapp=addfriend_<userId>`) auto-add the friendship on open. */
function readFriendIdFromStartParam(startParam: string | undefined): number | null {
  if (!startParam?.startsWith(START_PARAM_ADD_FRIEND_PREFIX)) return null;
  const id = Number(startParam.slice(START_PARAM_ADD_FRIEND_PREFIX.length));
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** Cross-fades Home<->Room via the View Transitions API where supported (Telegram's own iOS client's WebKit gained support in 2024); an instant swap otherwise — no worse than before. */
function navigateWithTransition(update: () => void): void {
  const startViewTransition = (document as Document & { startViewTransition?: (cb: () => void) => void })
    .startViewTransition;
  if (startViewTransition) startViewTransition.call(document, update);
  else update();
}

export function AppRouter() {
  const { startParam } = useLaunchParams();
  // A `video_<id>` deep link opens a brand-new room with that library video
  // already selected — resolve it to a room id once, on first mount.
  const [pendingVideoId] = useState<string | null>(() => readVideoIdFromStartParam(startParam));
  const [roomId, setRoomId] = useState<string | null>(
    () => readRoomIdFromStartParam(startParam) ?? (readVideoIdFromStartParam(startParam) ? generateRoomId() : null),
  );
  const [autoAddFriendId] = useState<number | null>(() => readFriendIdFromStartParam(startParam));
  const initialVideoId = roomId && pendingVideoId ? pendingVideoId : undefined;

  const openRoom = useCallback((id: string) => navigateWithTransition(() => setRoomId(id)), []);
  const goHome = useCallback(() => navigateWithTransition(() => setRoomId(null)), []);

  // Prefetch the Room screen's chunk while the user's still on Home, so the
  // near-certain first room-entry doesn't have to wait on the import —
  // without this, tapping "Create"/"Join" always shows a loading spinner
  // for however long that chunk takes to fetch and parse.
  useEffect(() => {
    if (!roomId) void loadRoomScreen();
  }, [roomId]);

  if (roomId) {
    return (
      <Suspense
        fallback={
          <Placeholder header="Загрузка...">
            <Spinner size="l" />
          </Placeholder>
        }
      >
        <RoomScreen roomId={roomId} onExit={goHome} initialVideoId={initialVideoId} />
      </Suspense>
    );
  }
  return <HomeScreen onOpenRoom={openRoom} autoAddFriendId={autoAddFriendId} />;
}
