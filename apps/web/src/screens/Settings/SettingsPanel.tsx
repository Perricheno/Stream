import { Cell, Input, List, Modal, SegmentedControl, Section, Switch } from "@telegram-apps/telegram-ui";
import type { AppLanguage } from "@stream/shared";
import { useProfile } from "../../telegram/ProfileContext";
import { useTranslation } from "../../i18n/useTranslation";
import { ModalBackdrop } from "../../components/ModalBackdrop";

interface SettingsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsPanel({ open, onOpenChange }: SettingsPanelProps) {
  const { profile, updateProfile } = useProfile();
  const { t } = useTranslation();

  if (!profile) return null;

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      header={<Modal.Header>{t("settings")}</Modal.Header>}
      overlayComponent={<ModalBackdrop />}
      style={{ backgroundColor: "var(--tg-theme-secondary-bg-color, #232e3c)" }}
    >
      <List>
        <Section header={t("profileInRoom")} footer={t("profileInRoomFooter")}>
          <Cell>
            <Input
              header={t("displayName")}
              placeholder={t("displayNamePlaceholder")}
              value={profile.displayName}
              onChange={(event) => updateProfile({ displayName: event.target.value })}
            />
          </Cell>
          <Cell
            after={
              <Switch
                checked={profile.hideProfile}
                onChange={(event) => updateProfile({ hideProfile: event.target.checked })}
              />
            }
            subtitle={t("hideProfileSubtitle")}
          >
            {t("hideProfile")}
          </Cell>
        </Section>

        <Section header={t("notificationsSection")}>
          <Cell
            after={
              <Switch
                checked={profile.notificationsEnabled}
                onChange={(event) => updateProfile({ notificationsEnabled: event.target.checked })}
              />
            }
            subtitle={t("notificationsSubtitle")}
          >
            {t("notificationsEnabled")}
          </Cell>
        </Section>

        <Section header={t("playerSection")}>
          <Cell
            after={<Switch checked={profile.autoplay} onChange={(event) => updateProfile({ autoplay: event.target.checked })} />}
            subtitle={t("autoplaySubtitle")}
          >
            {t("autoplay")}
          </Cell>
        </Section>

        <Section header={t("languageSection")}>
          <Cell>
            <SegmentedControl>
              {(["ru", "en"] as AppLanguage[]).map((lang) => (
                <SegmentedControl.Item
                  key={lang}
                  selected={profile.language === lang}
                  onClick={() => updateProfile({ language: lang })}
                >
                  {lang === "ru" ? t("languageRu") : t("languageEn")}
                </SegmentedControl.Item>
              ))}
            </SegmentedControl>
          </Cell>
        </Section>
      </List>
    </Modal>
  );
}
