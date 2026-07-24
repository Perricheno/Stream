import { useEffect, useRef, useState } from "react";
import { CHAT_MESSAGE_MAX_LENGTH, type ChatMessage, type ChatReplyPreview } from "@stream/shared";
import { StickerPlayer } from "../../stickers/StickerPlayer";
import { confirmAction } from "../../telegram/confirmAction";
import styles from "./ChatPanel.module.css";

function SendIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M3 20l18-8L3 4v6l12 2-12 2z" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M18.3 5.71 12 12l6.3 6.29-1.41 1.42L10.59 13.4 4.3 19.71 2.88 18.3 9.17 12 2.88 5.71 4.3 4.29l6.29 6.3 6.3-6.3z" />
    </svg>
  );
}

function formatMessageTime(sentAt: number): string {
  return new Date(sentAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

const REPLY_SNIPPET_MAX_LENGTH = 80;

function toReplyPreview(message: ChatMessage): ChatReplyPreview {
  return {
    id: message.id,
    fromName: message.fromName,
    text: message.text.length > REPLY_SNIPPET_MAX_LENGTH ? `${message.text.slice(0, REPLY_SNIPPET_MAX_LENGTH)}…` : message.text,
  };
}

interface ChatPanelProps {
  messages: ChatMessage[];
  currentUserId?: number;
  onSend: (text: string, replyTo?: ChatReplyPreview) => void;
  onEdit?: (id: string, text: string) => void;
  onDelete?: (id: string) => void;
  className?: string;
  /** Only set when this instance is the fullscreen slide-in overlay (see
   *  RoomScreen.tsx) — renders its own close affordance so there's always a
   *  way back regardless of where the panel is positioned on screen. */
  onClose?: () => void;
}

const NEAR_BOTTOM_THRESHOLD_PX = 80;

/** Inline chat feed rendered directly under the video, Telegram-bubble styled — not a modal, so it behaves like normal page content with the on-screen keyboard. Fills whatever height its parent gives it (see RoomScreen.module.css's flex layout). */
export function ChatPanel({ messages, currentUserId, onSend, onEdit, onDelete, className, onClose }: ChatPanelProps) {
  const [value, setValue] = useState("");
  const [unreadCount, setUnreadCount] = useState(0);
  // Tapping a bubble reveals its action row (reply always, edit/delete only
  // for your own messages) instead of a permanent per-message toolbar
  // cluttering every single bubble.
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
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

  const cancelCompose = () => {
    setReplyingTo(null);
    setEditingId(null);
    setValue("");
  };

  const startReply = (message: ChatMessage) => {
    setEditingId(null);
    setReplyingTo(message);
    setSelectedMessageId(null);
    inputRef.current?.focus();
  };

  const startEdit = (message: ChatMessage) => {
    setReplyingTo(null);
    setEditingId(message.id);
    setValue(message.text);
    setSelectedMessageId(null);
    inputRef.current?.focus();
  };

  const requestDelete = async (message: ChatMessage) => {
    setSelectedMessageId(null);
    const confirmed = await confirmAction("Удалить сообщение?", "Удаление сообщения", "Удалить");
    if (confirmed) onDelete?.(message.id);
  };

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    if (editingId) {
      onEdit?.(editingId, trimmed);
    } else {
      onSend(trimmed, replyingTo ? toReplyPreview(replyingTo) : undefined);
    }
    cancelCompose();
  };

  return (
    <div className={`${styles.panel} ${className ?? ""}`}>
      {onClose && (
        <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Закрыть чат">
          <CloseIcon />
        </button>
      )}
      <div className={styles.listWrapper}>
        <div ref={listRef} className={styles.list} onScroll={handleScroll}>
          {messages.length === 0 ? (
            <div className={styles.empty}>
              <StickerPlayer id="happy" size={80} />
              <span>Сообщений пока нет — напишите первым!</span>
            </div>
          ) : (
            messages.map((message) => {
              const isOwn = message.fromUserId === currentUserId;
              const isSelected = selectedMessageId === message.id;
              return (
                <div key={message.id} className={`${styles.row} ${isOwn ? styles.rowOwn : ""}`}>
                  <div
                    className={`${styles.bubble} ${isOwn ? styles.own : ""}`}
                    onClick={() => setSelectedMessageId((current) => (current === message.id ? null : message.id))}
                  >
                    {!isOwn && <div className={styles.sender}>{message.fromName}</div>}
                    {message.replyTo && (
                      <div className={styles.replyQuote}>
                        <span className={styles.replySender}>{message.replyTo.fromName}</span>
                        <span className={styles.replyText}>{message.replyTo.text}</span>
                      </div>
                    )}
                    <span className={styles.text}>{message.text}</span>
                    <span className={styles.time}>
                      {message.editedAt && <span className={styles.editedLabel}>изменено </span>}
                      {formatMessageTime(message.sentAt)}
                    </span>
                  </div>
                  {isSelected && (
                    <div className={styles.actionRow}>
                      <button type="button" className={styles.actionChip} onClick={() => startReply(message)}>
                        Ответить
                      </button>
                      {isOwn && onEdit && (
                        <button type="button" className={styles.actionChip} onClick={() => startEdit(message)}>
                          Изменить
                        </button>
                      )}
                      {isOwn && onDelete && (
                        <button
                          type="button"
                          className={`${styles.actionChip} ${styles.actionChipDestructive}`}
                          onClick={() => requestDelete(message)}
                        >
                          Удалить
                        </button>
                      )}
                    </div>
                  )}
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
      {(replyingTo || editingId) && (
        <div className={styles.composeBanner}>
          <div className={styles.composeBannerText}>
            <span className={styles.composeBannerLabel}>{editingId ? "Редактирование" : `Ответ ${replyingTo?.fromName}`}</span>
            <span className={styles.composeBannerSnippet}>{editingId ? messages.find((m) => m.id === editingId)?.text : replyingTo?.text}</span>
          </div>
          <button type="button" className={styles.composeBannerClose} onClick={cancelCompose} aria-label="Отмена">
            <CloseIcon />
          </button>
        </div>
      )}
      <div className={styles.inputRow}>
        <input
          ref={inputRef}
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
