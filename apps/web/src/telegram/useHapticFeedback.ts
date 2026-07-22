import { useMemo } from "react";
import { hapticFeedback } from "@telegram-apps/sdk-react";
import type {
  ImpactHapticFeedbackStyle,
  NotificationHapticFeedbackType,
} from "@telegram-apps/sdk-react";

export interface Haptics {
  impact: (style?: ImpactHapticFeedbackStyle) => void;
  notify: (type: NotificationHapticFeedbackType) => void;
  selectionChanged: () => void;
}

export function useHapticFeedback(): Haptics {
  return useMemo<Haptics>(
    () => ({
      impact: (style = "light") => {
        if (hapticFeedback.impactOccurred.isAvailable()) {
          hapticFeedback.impactOccurred(style);
        }
      },
      notify: (type) => {
        if (hapticFeedback.notificationOccurred.isAvailable()) {
          hapticFeedback.notificationOccurred(type);
        }
      },
      selectionChanged: () => {
        if (hapticFeedback.selectionChanged.isAvailable()) {
          hapticFeedback.selectionChanged();
        }
      },
    }),
    [],
  );
}
