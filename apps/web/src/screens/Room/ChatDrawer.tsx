import type { ChatMessage } from "@stream/shared";
import { ChatPanel } from "./ChatPanel";
import styles from "./ChatDrawer.module.css";

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

interface ChatDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  messages: ChatMessage[];
  currentUserId?: number;
  onSend: (text: string) => void;
}

/**
 * Chat as a slide-in side panel instead of a permanently docked block —
 * reachable from a button while watching (including in fullscreen, where the
 * video used to cover the whole screen and hide chat completely), without
 * permanently eating into the video's own space.
 */
export function ChatDrawer({ open, onOpenChange, messages, currentUserId, onSend }: ChatDrawerProps) {
  return (
    <>
      <div className={styles.backdrop} data-open={open} onClick={() => onOpenChange(false)} />
      <div className={styles.drawer} data-open={open}>
        <div className={styles.header}>
          <span className={styles.title}>Чат</span>
          <button type="button" className={styles.closeButton} onClick={() => onOpenChange(false)} aria-label="Закрыть чат">
            <CloseIcon />
          </button>
        </div>
        <ChatPanel className={styles.chatFill} messages={messages} currentUserId={currentUserId} onSend={onSend} />
      </div>
    </>
  );
}
