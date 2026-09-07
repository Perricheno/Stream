import { useCallback, useEffect, useState, type KeyboardEvent } from "react";
import { Button, Input, Placeholder, Section, SegmentedControl, Spinner } from "@telegram-apps/telegram-ui";
import type { LibraryVideo, SiteSearchResult, VideoSource, YouTubeSearchResult } from "@stream/shared";
import { StickerPlayer } from "../../stickers/StickerPlayer";
import { useTranslation } from "../../i18n/useTranslation";
import type { TranslationKey } from "../../i18n/translations";
import { ApiError } from "../../api/apiClient";
import { listVideos, resolveVideo, searchSites, searchYouTube } from "../../api/videoApi";
import { parseVideoUrl } from "./parseVideoUrl";
import styles from "./VideoSourcePicker.module.css";

const BOT_USERNAME = import.meta.env.VITE_BOT_USERNAME as string | undefined;

type Tab = "link" | "youtube" | "sites" | "library";

interface VideoSourcePickerProps {
  onSelect: (source: VideoSource) => void;
}

function ErrorRow({ text }: { text: string }) {
  return (
    <div className={styles.errorRow}>
      <StickerPlayer id="confused" size={28} />
      <span>{text}</span>
    </div>
  );
}

function NoResults({ t }: { t: (key: TranslationKey) => string }) {
  return (
    <Placeholder description={t("searchNoResults")}>
      <StickerPlayer id="not-found" size={80} />
    </Placeholder>
  );
}

function onEnter(submit: () => void) {
  return (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") submit();
  };
}

export function VideoSourcePicker({ onSelect }: VideoSourcePickerProps) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>("link");

  const [linkValue, setLinkValue] = useState("");
  const [linkLoading, setLinkLoading] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  const submitLink = useCallback(async () => {
    const trimmed = linkValue.trim();
    if (!trimmed) return;
    setLinkError(null);

    const fastParsed = parseVideoUrl(trimmed);
    if (fastParsed) {
      onSelect(fastParsed);
      return;
    }
    if (!/^https?:\/\//i.test(trimmed)) {
      setLinkError(t("linkNotRecognized"));
      return;
    }

    setLinkLoading(true);
    try {
      onSelect(await resolveVideo(trimmed));
    } catch {
      setLinkError(t("resolveFailed"));
    } finally {
      setLinkLoading(false);
    }
  }, [linkValue, onSelect, t]);

  const [ytQuery, setYtQuery] = useState("");
  const [ytResults, setYtResults] = useState<YouTubeSearchResult[] | null>(null);
  const [ytLoading, setYtLoading] = useState(false);
  const [ytError, setYtError] = useState<string | null>(null);

  const runYoutubeSearch = useCallback(async () => {
    const query = ytQuery.trim();
    if (!query) return;
    setYtLoading(true);
    setYtError(null);
    try {
      setYtResults(await searchYouTube(query));
    } catch (err) {
      setYtResults(null);
      setYtError(err instanceof ApiError ? err.message : t("searchFailed"));
    } finally {
      setYtLoading(false);
    }
  }, [ytQuery, t]);

  const [siteQuery, setSiteQuery] = useState("");
  const [siteResults, setSiteResults] = useState<SiteSearchResult[] | null>(null);
  const [siteLoading, setSiteLoading] = useState(false);
  const [siteError, setSiteError] = useState<string | null>(null);
  const [resolvingLink, setResolvingLink] = useState<string | null>(null);

  const runSiteSearch = useCallback(async () => {
    const query = siteQuery.trim();
    if (!query) return;
    setSiteLoading(true);
    setSiteError(null);
    try {
      setSiteResults(await searchSites(query));
    } catch (err) {
      setSiteResults(null);
      setSiteError(err instanceof ApiError ? err.message : t("searchFailed"));
    } finally {
      setSiteLoading(false);
    }
  }, [siteQuery, t]);

  const pickSiteResult = useCallback(
    async (link: string) => {
      setResolvingLink(link);
      setSiteError(null);
      try {
        onSelect(await resolveVideo(link));
      } catch {
        setSiteError(t("resolveFailed"));
      } finally {
        setResolvingLink(null);
      }
    },
    [onSelect, t],
  );

  const [libraryItems, setLibraryItems] = useState<LibraryVideo[] | null>(null);
  const [libraryLoading, setLibraryLoading] = useState(false);

  useEffect(() => {
    if (tab !== "library") return;
    let cancelled = false;
    setLibraryLoading(true);
    listVideos()
      .then((items) => {
        if (!cancelled) setLibraryItems(items);
      })
      .catch(() => {
        if (!cancelled) setLibraryItems([]);
      })
      .finally(() => {
        if (!cancelled) setLibraryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tab]);

  const openBot = useCallback(() => {
    if (BOT_USERNAME) window.open(`https://t.me/${BOT_USERNAME}`, "_blank");
  }, []);

  return (
    <Section header={t("whatAreWeWatching")}>
      <div className={styles.tabs}>
        <SegmentedControl>
          <SegmentedControl.Item selected={tab === "link"} onClick={() => setTab("link")}>
            {t("videoTabLink")}
          </SegmentedControl.Item>
          <SegmentedControl.Item selected={tab === "youtube"} onClick={() => setTab("youtube")}>
            {t("videoTabYoutube")}
          </SegmentedControl.Item>
          <SegmentedControl.Item selected={tab === "sites"} onClick={() => setTab("sites")}>
            {t("videoTabSites")}
          </SegmentedControl.Item>
          <SegmentedControl.Item selected={tab === "library"} onClick={() => setTab("library")}>
            {t("videoTabLibrary")}
          </SegmentedControl.Item>
        </SegmentedControl>
      </div>

      {tab === "link" && (
        <div className={styles.panel} style={{ animation: "fadeSlideUp 0.2s ease" }}>
          <Placeholder description={t("noVideoYet")}>
            <StickerPlayer id="searching" size={96} />
          </Placeholder>
          <Input
            placeholder="https://youtube.com/watch?v=..."
            value={linkValue}
            status={linkError ? "error" : "default"}
            onChange={(event) => {
              setLinkValue(event.target.value);
              setLinkError(null);
            }}
            onKeyDown={onEnter(submitLink)}
          />
          {linkError && <ErrorRow text={linkError} />}
          <Button stretched size="l" loading={linkLoading} disabled={!linkValue.trim() || linkLoading} onClick={submitLink}>
            {t("startWatching")}
          </Button>
          <p className={styles.hint}>{t("linkPickerFooter")}</p>
        </div>
      )}

      {tab === "youtube" && (
        <div className={styles.panel} style={{ animation: "fadeSlideUp 0.2s ease" }}>
          <div className={styles.searchRow}>
            <Input
              placeholder={t("searchYoutubePlaceholder")}
              value={ytQuery}
              onChange={(event) => setYtQuery(event.target.value)}
              onKeyDown={onEnter(runYoutubeSearch)}
            />
            <Button loading={ytLoading} disabled={!ytQuery.trim() || ytLoading} onClick={runYoutubeSearch}>
              {t("searchButton")}
            </Button>
          </div>
          {ytError && <ErrorRow text={ytError} />}
          {ytResults &&
            (ytResults.length === 0 ? (
              <NoResults t={t} />
            ) : (
              <div className={styles.resultsList}>
                {ytResults.map((result, index) => (
                  <button
                    key={result.videoId}
                    type="button"
                    className={styles.videoRow}
                    onClick={() => onSelect({ type: "youtube", videoId: result.videoId })}
                    style={{ animation: "fadeSlideUp 0.25s ease backwards", animationDelay: `${Math.min(index, 8) * 30}ms` }}
                  >
                    <div className={styles.videoThumb}>
                      <img src={result.thumbnailUrl} alt="" loading="lazy" />
                      {result.durationText && <span className={styles.videoDuration}>{result.durationText}</span>}
                    </div>
                    <div className={styles.videoMeta}>
                      <span className={styles.videoTitle}>{result.title}</span>
                      <span className={styles.videoChannel}>{result.channelTitle}</span>
                    </div>
                  </button>
                ))}
              </div>
            ))}
        </div>
      )}

      {tab === "sites" && (
        <div className={styles.panel} style={{ animation: "fadeSlideUp 0.2s ease" }}>
          <div className={styles.searchRow}>
            <Input
              placeholder={t("searchSitesPlaceholder")}
              value={siteQuery}
              onChange={(event) => setSiteQuery(event.target.value)}
              onKeyDown={onEnter(runSiteSearch)}
            />
            <Button loading={siteLoading} disabled={!siteQuery.trim() || siteLoading} onClick={runSiteSearch}>
              {t("searchButton")}
            </Button>
          </div>
          {siteError && <ErrorRow text={siteError} />}
          {siteResults &&
            (siteResults.length === 0 ? (
              <NoResults t={t} />
            ) : (
              <div className={styles.resultsList}>
                {siteResults.map((result, index) => (
                  <button
                    key={result.link}
                    type="button"
                    className={styles.videoRow}
                    onClick={() => pickSiteResult(result.link)}
                    style={{ animation: "fadeSlideUp 0.25s ease backwards", animationDelay: `${Math.min(index, 8) * 30}ms` }}
                  >
                    <div className={styles.videoThumb}>
                      {result.thumbnailUrl && <img src={result.thumbnailUrl} alt="" loading="lazy" />}
                      {resolvingLink === result.link && (
                        <span className={styles.videoDuration}>
                          <Spinner size="s" />
                        </span>
                      )}
                    </div>
                    <div className={styles.videoMeta}>
                      <span className={styles.videoTitle}>{result.title}</span>
                      <span className={styles.videoChannel}>{result.displayLink}</span>
                      {result.snippet && <span className={styles.videoSnippet}>{result.snippet}</span>}
                    </div>
                  </button>
                ))}
              </div>
            ))}
        </div>
      )}

      {tab === "library" && (
        <div className={styles.panel} style={{ animation: "fadeSlideUp 0.2s ease" }}>
          {libraryLoading && !libraryItems ? (
            <Placeholder>
              <Spinner size="l" />
            </Placeholder>
          ) : !libraryItems || libraryItems.length === 0 ? (
            <Placeholder description={t("libraryEmpty")}>
              <StickerPlayer id="searching" size={96} />
              {BOT_USERNAME && (
                <Button size="m" onClick={openBot} style={{ marginTop: 12 }}>
                  {t("libraryOpenBot")}
                </Button>
              )}
            </Placeholder>
          ) : (
            <div className={styles.resultsList}>
              {libraryItems.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  className={styles.videoRow}
                  onClick={() => onSelect({ type: "library", videoId: item.id, title: item.title || undefined })}
                  style={{ animation: "fadeSlideUp 0.25s ease backwards", animationDelay: `${Math.min(index, 8) * 30}ms` }}
                >
                  <div className={styles.videoThumb}>
                    <StickerPlayer id="searching" size={40} />
                  </div>
                  <div className={styles.videoMeta}>
                    <span className={styles.videoTitle}>{item.title || item.sourceUrl || item.id}</span>
                    {item.durationSeconds != null && (
                      <span className={styles.videoChannel}>{formatDuration(item.durationSeconds)}</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </Section>
  );
}

function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`;
}
