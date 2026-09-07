import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Last line of defence around the whole app.
 *
 * Several Telegram SDK calls throw outside a real Telegram client rather
 * than returning empty — one of them (useLaunchParams in AppProviders) once
 * left every browser visitor staring at a blank white page, because a throw
 * that high in the tree unmounts everything and React renders nothing at
 * all. Individual call sites are guarded now, but a silent blank page is
 * such a bad failure mode that it's worth a backstop that at least says
 * something went wrong and offers a reload.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[app] unhandled render error:", error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          minHeight: "100dvh",
          padding: 24,
          textAlign: "center",
          fontFamily: "system-ui, sans-serif",
          background: "#17212b",
          color: "#f5f5f5",
        }}
      >
        <div style={{ fontSize: 40 }}>😔</div>
        <div style={{ fontSize: 17, fontWeight: 600 }}>Что-то пошло не так</div>
        <div style={{ fontSize: 14, opacity: 0.7, maxWidth: 420 }}>{error.message}</div>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            marginTop: 8,
            padding: "10px 20px",
            border: 0,
            borderRadius: 10,
            background: "#2ea6ff",
            color: "#fff",
            fontSize: 15,
            cursor: "pointer",
          }}
        >
          Перезагрузить
        </button>
      </div>
    );
  }
}
