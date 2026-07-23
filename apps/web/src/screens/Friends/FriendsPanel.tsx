import { useCallback, useState } from "react";
import { Avatar, Button, Cell, List, Modal, Placeholder, Section, Snackbar } from "@telegram-apps/telegram-ui";
import { shareURL } from "@telegram-apps/sdk-react";
import { useFriends } from "../../telegram/useFriends";
import { useTelegramUser } from "../../telegram/useInitData";
import { useHapticFeedback } from "../../telegram/useHapticFeedback";
import { useTranslation } from "../../i18n/useTranslation";
import { api } from "../../api/apiClient";
import { StickerPlayer } from "../../stickers/StickerPlayer";
import { ModalBackdrop } from "../../components/ModalBackdrop";

const BOT_USERNAME = import.meta.env.VITE_BOT_USERNAME as string | undefined;

interface FriendsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set, each friend row offers "invite to this room" instead of just listing friends. */
  roomId?: string;
}

export function FriendsPanel({ open, onOpenChange, roomId }: FriendsPanelProps) {
  const { friends, loaded } = useFriends();
  const me = useTelegramUser();
  const haptics = useHapticFeedback();
  const { t } = useTranslation();
  const [toast, setToast] = useState<string | null>(null);
  const [invitingId, setInvitingId] = useState<number | null>(null);

  const addFriend = useCallback(async () => {
    if (!BOT_USERNAME || !me) {
      haptics.notify("error");
      setToast(t("addFriendFailed"));
      return;
    }
    const url = `https://t.me/${BOT_USERNAME}?startapp=addfriend_${me.id}`;
    try {
      // Opens Telegram's own contact/chat picker — by design this hands off
      // to a native flow and closes the Mini App. It has no isAvailable()
      // guard, so an unsupported client throws here rather than no-oping;
      // previously nothing caught that, so a tap could silently do nothing.
      shareURL(url, t("addFriendShareText"));
    } catch {
      try {
        await navigator.clipboard.writeText(url);
        haptics.notify("success");
        setToast(t("linkCopied"));
      } catch {
        haptics.notify("error");
        setToast(t("addFriendFailed"));
      }
    }
  }, [me, haptics, t]);

  const inviteFriend = useCallback(
    async (friendUserId: number) => {
      if (!roomId) return;
      setInvitingId(friendUserId);
      try {
        await api.post(`/rooms/${roomId}/invite`, { friendUserId });
        haptics.notify("success");
        setToast(t("inviteSent"));
      } catch {
        haptics.notify("error");
        setToast(t("inviteFailed"));
      } finally {
        setInvitingId(null);
      }
    },
    [roomId, haptics, t],
  );

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      header={<Modal.Header>{t("friendsTitle")}</Modal.Header>}
      overlayComponent={<ModalBackdrop />}
      style={{ backgroundColor: "var(--tg-theme-secondary-bg-color, #232e3c)" }}
    >
      <List>
        {loaded && friends.length === 0 ? (
          <Placeholder header={t("friendsEmptyTitle")} description={t("friendsEmptyDescription")}>
            <StickerPlayer id="invite" size={110} />
          </Placeholder>
        ) : (
          <Section>
            {friends.map((friend) => (
              <Cell
                key={friend.userId}
                before={<Avatar size={40} src={friend.photoUrl} acronym={friend.firstName.slice(0, 2).toUpperCase()} />}
                after={
                  roomId ? (
                    <Button size="s" mode="bezeled" loading={invitingId === friend.userId} onClick={() => inviteFriend(friend.userId)}>
                      {t("inviteToRoom")}
                    </Button>
                  ) : undefined
                }
              >
                {friend.firstName}
              </Cell>
            ))}
          </Section>
        )}
        <div style={{ padding: 16 }}>
          <Button stretched size="l" onClick={addFriend}>
            {t("addFriend")}
          </Button>
        </div>
      </List>
      {toast && <Snackbar onClose={() => setToast(null)} duration={2500}>{toast}</Snackbar>}
    </Modal>
  );
}
