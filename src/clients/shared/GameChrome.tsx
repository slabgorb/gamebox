import type { ReactNode } from "react";

interface Props {
  title: string;
  status: ReactNode;
  controls?: ReactNode;
  children: ReactNode;
}

export function GameChrome({ title, status, controls, children }: Props) {
  return (
    <>
      <header className="game-chrome__header">
        <h1 className="game-chrome__title">{title}</h1>
        <div className="game-chrome__status">{status}</div>
        {controls && <div className="game-chrome__controls">{controls}</div>}
      </header>
      {children}
    </>
  );
}
