import { useTelegramLoginWidget } from "./useTelegramLoginWidget";
import styles from "./TelegramLoginScreen.module.css";

/** Shown pre-login, before ProfileContext has anything to read a language
 *  preference from — a plain browser-language guess for just these few
 *  strings, independent of the app's own i18n system. */
const isRussian = navigator.language.toLowerCase().startsWith("ru");
const copy = isRussian
  ? {
      headline: "Смотрите видео вместе, без задержек",
      subheadline: "Общая комната, один плеер на всех и синхронное воспроизведение — с друзьями, где бы вы ни были.",
      features: ["🔄 Синхронно", "💬 Чат в комнате", "📺 Любые видео"],
      button: "Войти через Telegram",
      buttonPending: "Ждём подтверждения…",
      note: "Без паролей и регистрации — только ваш Telegram-аккаунт.",
      pendingNote: "Откройте бота и нажмите «Start» — эта страница войдёт сама.",
      openManually: "Не открылся Telegram? Откройте вручную",
      error: "Не получилось войти. Попробуйте ещё раз.",
      expired: "Время вышло. Нажмите «Войти» ещё раз.",
      notConfigured: "Вход через сайт пока не настроен.",
    }
  : {
      headline: "Watch videos together, perfectly in sync",
      subheadline: "One shared room, one player for everyone — with friends, wherever they are.",
      features: ["🔄 Real-time sync", "💬 Room chat", "📺 Any video"],
      button: "Log in with Telegram",
      buttonPending: "Waiting for confirmation…",
      note: "No passwords, no sign-up — just your Telegram account.",
      pendingNote: "Open the bot and press Start — this page will log itself in.",
      openManually: "Telegram didn't open? Open it manually",
      error: "Login failed. Please try again.",
      expired: "That took too long. Press Log in again.",
      notConfigured: "Website login isn't configured yet.",
    };

function TelegramGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M21.5 3.5 2.7 10.9c-1.2.5-1.2 1.2-.2 1.5l4.8 1.5 1.8 5.7c.2.6.4.8.8.8.4 0 .6-.2.9-.5l2.1-2 4.4 3.2c.8.5 1.4.2 1.6-.7l2.9-13.7c.3-1.2-.4-1.7-1.3-1.2Z"
        fill="#ffffff"
      />
    </svg>
  );
}

function BrandMark() {
  return (
    <div className={styles.brandMark}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M8 5v14l11-7-11-7Z" fill="#ffffff" />
      </svg>
    </div>
  );
}

/**
 * The standalone website's front door — shown instead of the app when
 * there's no Telegram Mini App identity to use (a plain browser visit) and
 * no web session yet (see App.tsx). A real landing page rather than a bare
 * placeholder, since this is the first thing a browser visitor sees of the
 * product, not a settings-style screen inside an already-trusted app.
 */
export function TelegramLoginScreen() {
  const { state, login, deepLink, configured } = useTelegramLoginWidget();

  return (
    <div className={styles.page}>
      <div className={styles.glow} aria-hidden />
      <div className={styles.content}>
        <div className={styles.brand}>
          <BrandMark />
          <span className={styles.brandName}>Stream</span>
        </div>

        <div className={styles.hero}>
          <h1 className={styles.headline}>{copy.headline}</h1>
          <p className={styles.subheadline}>{copy.subheadline}</p>
        </div>

        <div className={styles.features}>
          {copy.features.map((feature) => (
            <span key={feature} className={styles.feature}>
              {feature}
            </span>
          ))}
        </div>

        {configured ? (
          <div className={styles.ctaArea}>
            <button type="button" className={styles.ctaButton} onClick={login} disabled={state === "pending"}>
              {state === "pending" ? <span className={styles.spinner} aria-hidden /> : <TelegramGlyph />}
              {state === "pending" ? copy.buttonPending : copy.button}
            </button>
            <p className={styles.ctaNote}>{state === "pending" ? copy.pendingNote : copy.note}</p>
            {/* The deep link opens in a popup, which some browsers block —
                always leave a plain link as a way through. */}
            {state === "pending" && deepLink && (
              <a className={styles.ctaNote} href={deepLink} target="_blank" rel="noreferrer">
                {copy.openManually}
              </a>
            )}
            {state === "error" && <p className={styles.error}>{copy.error}</p>}
            {state === "expired" && <p className={styles.error}>{copy.expired}</p>}
          </div>
        ) : (
          <p className={styles.notConfigured}>{copy.notConfigured}</p>
        )}
      </div>
    </div>
  );
}
