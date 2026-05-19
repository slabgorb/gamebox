import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[client] render failed", error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="render-error" role="alert">
        <p className="render-error__msg">
          Something went wrong displaying this game.
        </p>
        <p className="render-error__detail">
          {error.message || String(error)}
        </p>
        <div className="render-error__actions">
          <a className="lobby-link" href="/">
            Back to Lobby
          </a>
          <button
            type="button"
            className="resign-btn"
            onClick={() => {
              try {
                location.reload();
              } catch {
                /* test env */
              }
            }}
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}
