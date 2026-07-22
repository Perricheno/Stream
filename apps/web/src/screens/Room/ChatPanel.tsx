import { useEffect, useRef, useState } from "react";
import { CHAT_MESSAGE_MAX_LENGTH, type ChatMessage } from "@stream/shared";
import styles from "./ChatPanel.module.css";

function SendIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M3 20l18-8L3 4v6l12 2-12 2z" />
    </svg>
  );
}

function formatMessageTime(sentAt: number): string {
  return new Date(sentAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

interface ChatPanelProps {
  messages: ChatMessage[];
  currentUserId?: number;
  onSend: (text: string) => void;
  className?: string;
}

const NEAR_BOTTOM_THRESHOLD_PX = 80;

/** Inline chat feed rendered directly under the video, Telegram-bubble styled — not a modal, so it behaves like normal page content with the on-screen keyboard. Fills whatever height its parent gives it (see RoomScreen.module.css's flex layout). */
export function ChatPanel({ messages, currentUserId, onSend, className }: ChatPanelProps) {
  const [value, setValue] = useState("");
  const [unreadCount, setUnreadCount] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const hasMountedRef = useRef(false);

  const scrollToBottom = () => {
    const list = listRef.current;
    if (!list) return;
    list.scrollTop = list.scrollHeight;
    setUnreadCount(0);
  };

  // Only auto-scroll on new messages if the user was already reading the
  // bottom of the chat — otherwise scrolling out from under someone reading
  // older messages is jarring. When they're scrolled up, surface an
  // unobtrusive "N new messages" pill instead (see .jumpToBottom below).
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      list.scrollTop = list.scrollHeight;
      return;
    }
    if (isNearBottomRef.current) {
      list.scrollTop = list.scrollHeight;
    } else {
      setUnreadCount((count) => count + 1);
    }
  }, [messages.length]);

  const handleScroll = () => {
    const list = listRef.current;
    if (!list) return;
    const distanceFromBottom = list.scrollHeight - list.scrollTop - list.clientHeight;
    isNearBottomRef.current = distanceFromBottom < NEAR_BOTTOM_THRESHOLD_PX;
    if (isNearBottomRef.current) setUnreadCount(0);
  };

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setValue("");
  };

  return (
    <div className={`${styles.panel} ${className ?? ""}`}>
      <div className={styles.listWrapper}>
        <div ref={listRef} className={styles.list} onScroll={handleScroll}>
          {messages.length === 0 ? (
            <div className={styles.empty}>Сообщений пока нет</div>
          ) : (
            messages.map((message) => {
              const isOwn = message.fromUserId === currentUserId;
              return (
                <div key={message.id} className={`${styles.row} ${isOwn ? styles.rowOwn : ""}`}>
                  <div className={`${styles.bubble} ${isOwn ? styles.own : ""}`}>
                    {!isOwn && <div className={styles.sender}>{message.fromName}</div>}
                    <span className={styles.text}>{message.text}</span>
                    <span className={styles.time}>{formatMessageTime(message.sentAt)}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
        {unreadCount > 0 && (
          <button type="button" className={styles.jumpToBottom} onClick={scrollToBottom}>
            ↓ {unreadCount}
          </button>
        )}
      </div>
      <div className={styles.inputRow}>
        <input
          className={styles.input}
          placeholder="Сообщение"
          value={value}
          maxLength={CHAT_MESSAGE_MAX_LENGTH}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              submit();
            }
          }}
        />
        <button type="button" className={styles.sendButton} onClick={submit} disabled={!value.trim()} aria-label="Отправить">
          <SendIcon />
        </button>
      </div>
    </div>
  );
}
