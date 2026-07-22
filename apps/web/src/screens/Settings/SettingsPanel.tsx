import { Cell, Input, List, Modal, Section, Switch } from "@telegram-apps/telegram-ui";
import { useUserSettings } from "../../telegram/useUserSettings";
import { ModalBackdrop } from "../../components/ModalBackdrop";

interface SettingsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsPanel({ open, onOpenChange }: SettingsPanelProps) {
  const { settings, updateSettings } = useUserSettings();

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      header={<Modal.Header>Настройки</Modal.Header>}
      overlayComponent={<ModalBackdrop />}
      style={{ backgroundColor: "var(--tg-theme-secondary-bg-color, #232e3c)" }}
    >
      <List>
        <Section header="Профиль в комнате" footer="Применяется во всех комнатах, которые вы создаёте или к которым присоединяетесь">
          <Cell>
            <Input
              header="Отображаемое имя"
              placeholder="Имя из Telegram"
              value={settings.displayName}
              onChange={(event) => updateSettings({ displayName: event.target.value })}
            />
          </Cell>
          <Cell
            after={
              <Switch
                checked={settings.hideProfile}
                onChange={(event) => updateSettings({ hideProfile: event.target.checked })}
              />
            }
            subtitle="Другие участники увидят вас как «Аноним», без имени и фото"
          >
            Скрыть профиль от других
          </Cell>
        </Section>
      </List>
    </Modal>
  );
}
