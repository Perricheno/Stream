import { Caption, IconButton } from "@telegram-apps/telegram-ui";
import { Icon28AddCircle } from "@telegram-apps/telegram-ui/dist/icons/28/add_circle";
import { Icon24QR } from "@telegram-apps/telegram-ui/dist/icons/24/qr";
import styles from "./CreateRoomCard.module.css";

interface CreateRoomCardProps {
  onCreate: () => void;
  onJoin: () => void;
}

/** Mirrors @wallet's row of round action buttons (Перевести/Пополнить/...) for our two primary actions. */
export function CreateRoomCard({ onCreate, onJoin }: CreateRoomCardProps) {
  return (
    <div className={styles.row}>
      <div className={styles.action}>
        <IconButton mode="bezeled" size="l" onClick={onCreate} aria-label="Создать комнату">
          <Icon28AddCircle />
        </IconButton>
        <Caption level="1" className={styles.label}>
          Создать
        </Caption>
      </div>
      <div className={styles.action}>
        <IconButton mode="bezeled" size="l" onClick={onJoin} aria-label="Присоединиться по коду">
          <Icon24QR />
        </IconButton>
        <Caption level="1" className={styles.label}>
          Войти по коду
        </Caption>
      </div>
    </div>
  );
}
