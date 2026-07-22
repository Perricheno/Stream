import { lazy, Suspense, useCallback, useState } from "react";
import { useLaunchParams } from "@telegram-apps/sdk-react";
import { Placeholder, Spinner } from "@telegram-apps/telegram-ui";
import { HomeScreen } from "../screens/Home/HomeScreen";

// Room pulls in socket.io-client, hls.js, the YouTube adapter and lottie-web —
// keep it out of the initial bundle so Home (the more frequently hit screen)
// stays fast to load.
const RoomScreen = lazy(() => import("../screens/Room/RoomScreen").then((m) => ({ default: m.RoomScreen })));

const START_PARAM_ROOM_PREFIX = "room_";

/** Lets a shared room link (`t.me/<bot>?startapp=room_XXXX`) open straight into that room. */
function readRoomIdFromStartParam(startParam: string | undefined): string | null {
  if (!startParam?.startsWith(START_PARAM_ROOM_PREFIX)) return null;
  return startParam.slice(START_PARAM_ROOM_PREFIX.length).toUpperCase();
}

export function AppRouter() {
  const { startParam } = useLaunchParams();
  const [roomId, setRoomId] = useState<string | null>(() => readRoomIdFromStartParam(startParam));

  const openRoom = useCallback((id: string) => setRoomId(id), []);
  const goHome = useCallback(() => setRoomId(null), []);

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
  return <HomeScreen onOpenRoom={openRoom} />;
}
