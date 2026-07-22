import { useCallback, useMemo, useState } from "react";
import { Button, Input, Placeholder, Section } from "@telegram-apps/telegram-ui";
import type { VideoSource } from "@stream/shared";
import { StickerPlayer } from "../../stickers/StickerPlayer";

const YOUTUBE_PATTERN = /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/))([\w-]{11})/;

function parseVideoUrl(raw: string): VideoSource | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const youtubeMatch = trimmed.match(YOUTUBE_PATTERN);
  if (youtubeMatch) return { type: "youtube", videoId: youtubeMatch[1] };

  if (!/^https?:\/\//i.test(trimmed)) return null;
  if (/\.m3u8(\?|$)/i.test(trimmed)) return { type: "file", url: trimmed, kind: "hls" };
  return { type: "file", url: trimmed, kind: "mp4" };
}

interface VideoSourcePickerProps {
  onSelect: (source: VideoSource) => void;
}

export function VideoSourcePicker({ onSelect }: VideoSourcePickerProps) {
  const [value, setValue] = useState("");
  const parsed = useMemo(() => parseVideoUrl(value), [value]);
  const isInvalid = value.trim().length > 0 && !parsed;

  const submit = useCallback(() => {
    if (parsed) onSelect(parsed);
  }, [parsed, onSelect]);

  return (
    <Section header="Что смотрим?" footer="Вставьте ссылку на YouTube или прямую ссылку на видео (mp4/HLS)">
      <Placeholder description="Пока никто не выбрал видео">
        <StickerPlayer id="searching" size={96} />
      </Placeholder>
      <div style={{ padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
        <Input
          placeholder="https://youtube.com/watch?v=..."
          value={value}
          status={isInvalid ? "error" : "default"}
          onChange={(event) => setValue(event.target.value)}
        />
        {isInvalid && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <StickerPlayer id="confused" size={32} />
            <span style={{ color: "var(--tg-theme-destructive-text-color, #ec3942)", fontSize: 14 }}>
              Не получилось распознать ссылку
            </span>
          </div>
        )}
        <Button stretched size="l" disabled={!parsed} onClick={submit}>
          Начать просмотр
        </Button>
      </div>
    </Section>
  );
}
