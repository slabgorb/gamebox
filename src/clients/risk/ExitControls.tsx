interface Props {
  onResign: () => void;
}
export function ExitControls({ onResign }: Props) {
  return (
    <span className="exit-controls">
      <a className="lobby-link" href="/">
        Lobby
      </a>
      <button
        className="resign-btn"
        type="button"
        onClick={onResign}
      >
        Resign
      </button>
    </span>
  );
}
