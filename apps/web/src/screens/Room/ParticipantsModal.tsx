import { Avatar, Cell, IconButton, List, Modal, Section } from "@telegram-apps/telegram-ui";
import type { Participant } from "@stream/shared";
import { useTranslation } from "../../i18n/useTranslation";
import { confirmAction } from "../../telegram/confirmAction";
import { ModalBackdrop } from "../../components/ModalBackdrop";

function RemoveIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
    </svg>
  );
}

function InviteIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M15 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4zm-9 9v-1c0-2.76 3.14-5 7-5a8.5 8.5 0 0 1 2.6.4A5.5 5.5 0 0 0 15 20a5.4 5.4 0 0 0 .17 1H6zM19 13v3h3v2h-3v3h-2v-3h-3v-2h3v-3z" />
    </svg>
  );
}

interface ParticipantsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  participants: Participant[];
  currentUserId?: number;
  isHost: boolean;
  onKick: (userId: number) => void;
  onInvite: () => void;
}

export function ParticipantsModal({
  open,
  onOpenChange,
  participants,
  currentUserId,
  isHost,
  onKick,
  onInvite,
}: ParticipantsModalProps) {
  const { t } = useTranslation();

  const handleKick = async (participant: Participant) => {
    const confirmed = await confirmAction(
      t("removeParticipantDescription").replace("{name}", participant.firstName),
      t("removeParticipantTitle"),
      t("removeParticipant"),
    );
    if (confirmed) onKick(participant.userId);
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      header={<Modal.Header>{t("participantsTitle")}</Modal.Header>}
      overlayComponent={<ModalBackdrop />}
      style={{ backgroundColor: "var(--tg-theme-secondary-bg-color, #232e3c)" }}
    >
      <List>
        <Section>
          {participants.map((participant, index) => {
            const kickable = isHost && participant.userId !== currentUserId;
            return (
              <Cell
                key={participant.userId}
                style={{ animation: "fadeSlideUp 0.25s ease backwards", animationDelay: `${Math.min(index, 8) * 30}ms` }}
                before={
                  <Avatar
                    size={40}
                    src={participant.photoUrl}
                    acronym={participant.firstName.slice(0, 2).toUpperCase()}
                  />
                }
                subtitle={participant.isHost ? t("hostBadge") : undefined}
                after={
                  kickable ? (
                    <IconButton
                      mode="plain"
                      size="s"
                      onClick={() => handleKick(participant)}
                      aria-label={`${t("removeParticipant")} ${participant.firstName}`}
                    >
                      <RemoveIcon />
                    </IconButton>
                  ) : undefined
                }
              >
                {participant.firstName}
                {participant.userId === currentUserId ? ` (${t("youLabel")})` : ""}
              </Cell>
            );
          })}
        </Section>
        <div style={{ padding: 16 }}>
          <Cell
            before={<InviteIcon />}
            onClick={() => {
              onOpenChange(false);
              onInvite();
            }}
            style={{ borderRadius: 12, background: "var(--tg-theme-bg-color, #17212b)" }}
          >
            {t("inviteToRoom")}
          </Cell>
        </div>
      </List>
    </Modal>
  );
}
