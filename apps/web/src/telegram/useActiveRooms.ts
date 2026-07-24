import { useCallback, useEffect, useState } from "react";
import type { ActiveRoom } from "@stream/shared";
import { api } from "../api/apiClient";

const POLL_MS = 15_000;

/** Every currently-open room, refreshed on a timer — lets Home surface
 *  "something is being watched right now" without anyone having to send a
 *  link first. Not friend-gated (see ActiveRoom's doc comment). */
export function useActiveRooms() {
  const [rooms, setRooms] = useState<ActiveRoom[]>([]);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(() => {
    return api
      .get<ActiveRoom[]>("/rooms/active")
      .then((data) => {
        setRooms(data);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  useEffect(() => {
    void refresh();
    const interval = setInterval(refresh, POLL_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [refresh]);

  return { rooms, loaded };
}
