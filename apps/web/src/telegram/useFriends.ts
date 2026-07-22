import { useCallback, useEffect, useState } from "react";
import type { FriendSummary } from "@stream/shared";
import { api } from "../api/apiClient";

export function useFriends() {
  const [friends, setFriends] = useState<FriendSummary[]>([]);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(() => {
    return api
      .get<FriendSummary[]>("/friends")
      .then((data) => {
        setFriends(data);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const addFriend = useCallback(
    async (friendUserId: number) => {
      const updated = await api.post<FriendSummary[]>("/friends/add", { friendUserId });
      setFriends(updated);
      return updated;
    },
    [],
  );

  return { friends, loaded, refresh, addFriend };
}
