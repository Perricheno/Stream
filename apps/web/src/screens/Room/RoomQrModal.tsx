import { Modal } from "@telegram-apps/telegram-ui";
import { useTranslation } from "../../i18n/useTranslation";
import { QrCodeImage } from "../../components/QrCodeImage";
import { ModalBackdrop } from "../../components/ModalBackdrop";

interface RoomQrModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roomId: string;
  inviteUrl: string;
}

export function RoomQrModal({ open, onOpenChange, roomId, inviteUrl }: RoomQrModalProps) {
  const { t } = useTranslation();

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      header={<Modal.Header>{t("showQrCode")}</Modal.Header>}
      overlayComponent={<ModalBackdrop />}
      style={{ backgroundColor: "var(--tg-theme-secondary-bg-color, #232e3c)" }}
    >
      <div style={{ padding: "8px 16px 32px", display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
        <QrCodeImage value={inviteUrl} size={220} />
        <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: 2 }}>{roomId}</div>
        <div style={{ color: "var(--tg-theme-hint-color, #708499)", fontSize: 14, textAlign: "center" }}>
          {t("qrCodeHint")}
        </div>
      </div>
    </Modal>
  );
}
