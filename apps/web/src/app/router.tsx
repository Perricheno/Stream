import { lazy, Suspense, useCallback, useState } from "react";
import { useLaunchParams } from "@telegram-apps/sdk-react";
import { Placeholder, Spinner } from "@telegram-apps/telegram-ui";
import { HomeScreen } from "../screens/Home/HomeScreen";

// Room pulls in socket.io-client, hls.js, the YouTube adapter and lottie-web —
// keep it out of the initial bundle so Home (the more frequently hit screen)
// stays fast to load.
const RoomScreen = lazy(() => import("../screens/Room/RoomScreen").then((m) => ({ default: m.RoomScreen })));

const START_PARAM_ROOM_PREFIX = "room_";
const START_PARAM_ADD_FRIEND_PREFIX = "addfriend_";

/** Lets a shared room link (`t.me/<bot>?startapp=room_XXXX`) open straight into that room. */
function readRoomIdFromStartParam(startParam: string | undefined): string | null {
  if (!startParam?.startsWith(START_PARAM_ROOM_PREFIX)) return null;
  return startParam.slice(START_PARAM_ROOM_PREFIX.length).toUpperCase();
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
  const [roomId, setRoomId] = useState<string | null>(() => readRoomIdFromStartParam(startParam));
  const [autoAddFriendId] = useState<number | null>(() => readFriendIdFromStartParam(startParam));

  const openRoom = useCallback((id: string) => navigateWithTransition(() => setRoomId(id)), []);
  const goHome = useCallback(() => navigateWithTransition(() => setRoomId(null)), []);

  if (roomId) {
    return (
      <Suspense
        fallback={
          <Placeholder header="Загрузка...">
            <Spinner size="l" />
          </Placeholder>
        }
      >
        <RoomScreen roomId={roomId} onExit={goHome} />
      </Suspense>
    );
  }
  return <HomeScreen onOpenRoom={openRoom} autoAddFriendId={autoAddFriendId} />;
}
