import { useCallback, useEffect, useState } from "react";
import type { ActiveFriendRoom } from "@stream/shared";
import { api } from "../api/apiClient";

const POLL_MS = 15_000;

/** Friends' currently-open rooms, refreshed on a timer — lets Home surface
 *  "X is watching something" without anyone having to send a link first. */
export function useActiveFriendRooms() {
  const [rooms, setRooms] = useState<ActiveFriendRoom[]>([]);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(() => {
    return api
      .get<ActiveFriendRoom[]>("/friends/active-rooms")
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
