import { useEffect, useState } from "react";
import { Avatar, Button, Cell, List, Modal, Section, Spinner } from "@telegram-apps/telegram-ui";
import { useProfile } from "../../telegram/ProfileContext";
import { useTelegramUser } from "../../telegram/useInitData";
import { isRealTelegramClient, shouldUseTelegramAuth } from "../../telegram/environment";
import { useTranslation } from "../../i18n/useTranslation";
import { useFriends } from "../../telegram/useFriends";
import { listVideos } from "../../api/videoApi";
import { ModalBackdrop } from "../../components/ModalBackdrop";

interface ProfileScreenProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function initials(name: string): string {
  return name.trim().slice(0, 1).toUpperCase() || "?";
}

/**
 * Identity card: who the app thinks you are, plus a couple of at-a-glance
 * counts (library size, friends). Editing lives in Settings already — this
 * is read-only except for logging out, which only makes sense for the
 * browser-login path (a real Telegram launch has no session to log out of;
 * every request just re-proves identity via initData).
 */
export function ProfileScreen({ open, onOpenChange }: ProfileScreenProps) {
  const { profile } = useProfile();
  const telegramUser = useTelegramUser();
  const { friends, loaded: friendsLoaded } = useFriends();
  const { t } = useTranslation();
  const [videoCount, setVideoCount] = useState<number | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    if (!open) return;
    listVideos()
      .then((videos) => setVideoCount(videos.length))
      .catch(() => setVideoCount(null));
  }, [open]);

  if (!profile) return null;

  const photoUrl = isRealTelegramClient() ? telegramUser?.photoUrl : undefined;
  const canLogOut = !shouldUseTelegramAuth();

  const logOut = async () => {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
      window.location.reload();
    } catch {
      setLoggingOut(false);
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      header={<Modal.Header>{t("profile")}</Modal.Header>}
      overlayComponent={<ModalBackdrop />}
      style={{ backgroundColor: "var(--tg-theme-secondary-bg-color, #232e3c)" }}
    >
      <List>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "24px 16px 8px" }}>
          <Avatar size={96} src={photoUrl} acronym={photoUrl ? undefined : initials(profile.displayName)} />
          <div style={{ fontSize: 18, fontWeight: 600 }}>{profile.displayName}</div>
        </div>

        <Section>
          <Cell subtitle={t("myVideos")}>{videoCount === null ? <Spinner size="s" /> : videoCount}</Cell>
          <Cell subtitle={t("friends")}>{friendsLoaded ? friends.length : <Spinner size="s" />}</Cell>
        </Section>

        {canLogOut && (
          <Section>
            <div style={{ padding: "8px 16px 16px" }}>
              <Button stretched size="l" mode="bezeled" loading={loggingOut} onClick={logOut}>
                {t("logOut")}
              </Button>
            </div>
          </Section>
        )}
      </List>
    </Modal>
  );
}
