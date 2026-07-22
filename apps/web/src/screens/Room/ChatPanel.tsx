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
}

/** Inline chat feed rendered directly under the video, Telegram-bubble styled — not a modal, so it behaves like normal page content with the on-screen keyboard. */
export function ChatPanel({ messages, currentUserId, onSend }: ChatPanelProps) {
  const [value, setValue] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages.length]);

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setValue("");
  };

  return (
    <div className={styles.panel}>
      <div ref={listRef} className={styles.list}>
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
