import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Button, Cell, IconButton, Input, List, Modal, Section } from "@telegram-apps/telegram-ui";
import { openQrScanner } from "@telegram-apps/sdk-react";
import { parseRoomCodeFromScan } from "../../app/parseRoomLink";
import { useHapticFeedback } from "../../telegram/useHapticFeedback";
import { useRecentRooms } from "../../telegram/useRecentRooms";
import { useFriends } from "../../telegram/useFriends";
import { useActiveRooms } from "../../telegram/useActiveRooms";
import { useFullscreen } from "../../telegram/useFullscreen";
import { useHomeScreenPrompt } from "../../telegram/useHomeScreenPrompt";
import { useTranslation } from "../../i18n/useTranslation";
import { StickerPlayer } from "../../stickers/StickerPlayer";
import { ServiceStatusIndicator } from "../../status/ServiceStatusIndicator";
import { ModalBackdrop } from "../../components/ModalBackdrop";
import { CreateRoomCard } from "./CreateRoomCard";
import { RecentRoomsList } from "./RecentRoomsList";
import { ActiveRoomsList } from "./ActiveRoomsList";

// Both are modals only needed once actually opened — Home is the one screen
// that's never itself lazy, so anything imported eagerly here ships in the
// main bundle for every user regardless of whether they ever open either.
const SettingsPanel = lazy(() => import("../Settings/SettingsPanel").then((m) => ({ default: m.SettingsPanel })));
const FriendsPanel = lazy(() => import("../Friends/FriendsPanel").then((m) => ({ default: m.FriendsPanel })));

function GearIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zm8.94 2.5a7.99 7.99 0 0 0-.16-1.6l1.9-1.48a.75.75 0 0 0 .18-.95l-1.8-3.1a.75.75 0 0 0-.9-.32l-2.24.9a8.2 8.2 0 0 0-1.38-.8l-.34-2.38a.75.75 0 0 0-.74-.64h-3.6a.75.75 0 0 0-.74.64l-.34 2.38c-.5.2-.96.47-1.38.8l-2.24-.9a.75.75 0 0 0-.9.32l-1.8 3.1a.75.75 0 0 0 .18.95l1.9 1.48c-.1.52-.16 1.05-.16 1.6s.06 1.08.16 1.6l-1.9 1.48a.75.75 0 0 0-.18.95l1.8 3.1c.18.32.57.45.9.32l2.24-.9c.42.33.88.6 1.38.8l.34 2.38c.06.37.38.64.74.64h3.6c.36 0 .68-.27.74-.64l.34-2.38c.5-.2.96-.47 1.38-.8l2.24.9c.33.13.72 0 .9-.32l1.8-3.1a.75.75 0 0 0-.18-.95l-1.9-1.48c.1-.52.16-1.05.16-1.6z" />
    </svg>
  );
}

function PeopleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M9 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm0 2c-3.33 0-8 1.67-8 5v2h16v-2c0-3.33-4.67-5-8-5zm7.5-2a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zm0 1.5c-.6 0-1.28.07-2 .2 1.86 1 3 2.4 3 4.3v2h6v-2c0-3-4-4.5-7-4.5z" />
    </svg>
  );
}

function ExpandIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M4 9V4h5v2H6v3H4zm0 6h2v3h3v2H4v-5zm16-6h-2V6h-3V4h5v5zm-2 6h2v5h-5v-2h3v-3z" />
    </svg>
  );
}

function CollapseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M9 4H7v3H4v2h5V4zm6 0v5h5V7h-3V4h-2zM4 15v2h3v3h2v-5H4zm11 5h2v-3h3v-2h-5v5z" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2a5 5 0 0 0-5 5c0 2.5 2 4.9 3 6.6V21a2 2 0 0 0 4 0v-7.4c1-1.7 3-4.1 3-6.6a5 5 0 0 0-5-5zm0 7a2 2 0 1 1 0-4 2 2 0 0 1 0 4z" />
    </svg>
  );
}

function generateRoomId(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

interface HomeScreenProps {
  onOpenRoom: (roomId: string) => void;
  autoAddFriendId?: number | null;
}

export function HomeScreen({ onOpenRoom, autoAddFriendId }: HomeScreenProps) {
  const { rooms, loaded, addRoom } = useRecentRooms();
  const { addFriend } = useFriends();
  const { rooms: activeRooms } = useActiveRooms();
  const haptics = useHapticFeedback();
  const { t } = useTranslation();
  const fullscreen = useFullscreen();
  const homeScreenPrompt = useHomeScreenPrompt();
  const [joinOpen, setJoinOpen] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [friendsOpen, setFriendsOpen] = useState(false);
  const [friendsLoaded, setFriendsLoaded] = useState(false);
  const autoAddedRef = useRef(false);

  const openSettings = useCallback(() => {
    setSettingsLoaded(true);
    setSettingsOpen(true);
  }, []);
  const openFriends = useCallback(() => {
    setFriendsLoaded(true);
    setFriendsOpen(true);
  }, []);

  useEffect(() => {
    if (!autoAddFriendId || autoAddedRef.current) return;
    autoAddedRef.current = true;
    addFriend(autoAddFriendId)
      .then(() => {
        haptics.notify("success");
        openFriends();
      })
      .catch(() => haptics.notify("error"));
  }, [autoAddFriendId, addFriend, haptics, openFriends]);

  const openActiveRoom = useCallback(
    (roomId: string) => {
      haptics.impact("medium");
      addRoom(roomId);
      onOpenRoom(roomId);
    },
    [addRoom, onOpenRoom, haptics],
  );

  const createRoom = useCallback(() => {
    haptics.impact("medium");
    const id = generateRoomId();
    addRoom(id);
    onOpenRoom(id);
  }, [addRoom, onOpenRoom, haptics]);

  const joinRoom = useCallback(() => {
    const id = joinCode.trim().toUpperCase();
    if (!id) return;
    haptics.impact("medium");
    addRoom(id);
    setJoinOpen(false);
    setJoinCode("");
    onOpenRoom(id);
  }, [joinCode, addRoom, onOpenRoom, haptics]);

  const scanQrToJoin = useCallback(async () => {
    if (!openQrScanner.isAvailable()) return;
    try {
      const scanned = await openQrScanner({ text: t("scanQrPrompt") });
      if (!scanned) return; // scanner closed without a result
      const code = parseRoomCodeFromScan(scanned);
      if (!code) {
        haptics.notify("error");
        return;
      }
      haptics.impact("medium");
      addRoom(code);
      setJoinOpen(false);
      setJoinCode("");
      onOpenRoom(code);
    } catch {
      haptics.notify("error");
    }
  }, [addRoom, onOpenRoom, haptics, t]);

  return (
    <List>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 12, padding: "12px 16px 0" }}>
        <ServiceStatusIndicator />
        {fullscreen.isSupported && (
          <IconButton
            mode="plain"
            size="m"
            onClick={fullscreen.toggle}
            aria-label={fullscreen.isFullscreen ? t("exitFullscreen") : t("enterFullscreen")}
          >
            {fullscreen.isFullscreen ? <CollapseIcon /> : <ExpandIcon />}
          </IconButton>
        )}
        <IconButton mode="plain" size="m" onClick={openFriends} aria-label={t("friends")}>
          <PeopleIcon />
        </IconButton>
        <IconButton mode="plain" size="m" onClick={openSettings} aria-label={t("settings")}>
          <GearIcon />
        </IconButton>
      </div>

      <Section header={t("appTitle")} footer={t("appTagline")}>
        <CreateRoomCard onCreate={createRoom} onJoin={() => setJoinOpen(true)} />
      </Section>

      {homeScreenPrompt.canPrompt && (
        <Section>
          <Cell before={<PinIcon />} onClick={homeScreenPrompt.prompt}>
            {t("addToHomeScreen")}
          </Cell>
        </Section>
      )}

      <ActiveRoomsList rooms={activeRooms} onOpenRoom={openActiveRoom} />

      <RecentRoomsList rooms={loaded ? rooms : null} onOpenRoom={onOpenRoom} />

      <Modal
        open={joinOpen}
        onOpenChange={setJoinOpen}
        header={<Modal.Header>{t("joinByCodeTitle")}</Modal.Header>}
        overlayComponent={<ModalBackdrop />}
        style={{ backgroundColor: "var(--tg-theme-secondary-bg-color, #232e3c)" }}
      >
        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <StickerPlayer id="invite" size={96} />
          </div>
          <Input
            header={t("roomCode")}
            placeholder={t("roomCodePlaceholder")}
            value={joinCode}
            onChange={(event) => setJoinCode(event.target.value)}
          />
          <Button stretched size="l" disabled={!joinCode.trim()} onClick={joinRoom}>
            {t("join")}
          </Button>
          {openQrScanner.isAvailable() && (
            <Button stretched size="l" mode="bezeled" onClick={scanQrToJoin}>
              {t("scanQrCode")}
            </Button>
          )}
        </div>
      </Modal>

      {friendsLoaded && (
        <Suspense fallback={null}>
          <FriendsPanel open={friendsOpen} onOpenChange={setFriendsOpen} />
        </Suspense>
      )}
      {settingsLoaded && (
        <Suspense fallback={null}>
          <SettingsPanel open={settingsOpen} onOpenChange={setSettingsOpen} />
        </Suspense>
      )}
    </List>
  );
}
