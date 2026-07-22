import { useEffect, useRef, useState } from "react";
import { IconButton, Input, Modal } from "@telegram-apps/telegram-ui";
import { CHAT_MESSAGE_MAX_LENGTH, type ChatMessage } from "@stream/shared";
import styles from "./ChatPanel.module.css";

function SendIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M3 20l18-8L3 4v6l12 2-12 2z" />
    </svg>
  );
}

function formatMessageTime(sentAt: number): string {
  return new Date(sentAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

interface ChatPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  messages: ChatMessage[];
  currentUserId?: number;
  onSend: (text: string) => void;
}

export function ChatPanel({ open, onOpenChange, messages, currentUserId, onSend }: ChatPanelProps) {
  const [value, setValue] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [open, messages.length]);

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setValue("");
  };

  return (
    <Modal open={open} onOpenChange={onOpenChange} header={<Modal.Header>Чат</Modal.Header>}>
      <div ref={listRef} className={styles.list}>
        {messages.length === 0 ? (
          <div className={styles.empty}>Сообщений пока нет</div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`${styles.message} ${message.fromUserId === currentUserId ? styles.own : ""}`}
            >
              {message.fromUserId !== currentUserId && <div className={styles.sender}>{message.fromName}</div>}
              <div className={styles.text}>{message.text}</div>
              <div className={styles.time}>{formatMessageTime(message.sentAt)}</div>
            </div>
          ))
        )}
      </div>
      <div className={styles.inputRow}>
        <Input
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
        <IconButton mode="bezeled" size="m" onClick={submit} disabled={!value.trim()} aria-label="Отправить">
          <SendIcon />
        </IconButton>
      </div>
    </Modal>
  );
}
