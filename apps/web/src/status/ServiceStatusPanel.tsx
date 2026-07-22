import { Button, Cell, List, Modal, Section } from "@telegram-apps/telegram-ui";
import type { ServiceStatus } from "./useServiceStatus";

const STATE_LABEL: Record<ServiceStatus["state"], string> = {
  checking: "Проверяем...",
  ok: "Всё работает",
  slow: "Медленно",
  down: "Недоступен",
};

interface ServiceStatusPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  status: ServiceStatus;
}

export function ServiceStatusPanel({ open, onOpenChange, status }: ServiceStatusPanelProps) {
  return (
    <Modal open={open} onOpenChange={onOpenChange} header={<Modal.Header>Статус сервиса</Modal.Header>}>
      <List>
        <Section header={STATE_LABEL[status.state]}>
          <Cell after={status.latencyMs !== null ? `${status.latencyMs} мс` : "—"}>Задержка</Cell>
          <Cell after={status.socketConnected ? "Подключено" : "Не подключено"}>Соединение</Cell>
          <Cell after={status.activeRooms ?? "—"}>Активных комнат</Cell>
          <Cell after={status.connectedSockets ?? "—"}>Подключений к серверу</Cell>
          <Cell after={status.uptimeSeconds !== null ? `${Math.floor(status.uptimeSeconds / 60)} мин` : "—"}>
            Аптайм сервера
          </Cell>
          <Cell
            after={
              status.networkEffectiveType
                ? `${status.networkEffectiveType}${status.networkDownlinkMbps ? ` · ~${status.networkDownlinkMbps} Мбит/с` : ""}`
                : "недоступно"
            }
          >
            Сеть
          </Cell>
          <Cell
            after={status.lastCheckedAt ? new Date(status.lastCheckedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—"}
          >
            Последняя проверка
          </Cell>
        </Section>
        <div style={{ padding: 16 }}>
          <Button stretched size="m" mode="bezeled" onClick={status.recheck}>
            Проверить снова
          </Button>
        </div>
      </List>
    </Modal>
  );
}
