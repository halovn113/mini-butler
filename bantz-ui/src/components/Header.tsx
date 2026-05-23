import { Minus, Square, X } from "lucide-react";
import { StagMark } from "../lib/stag";
import type { WsStatus } from "../hooks/useWebSocket";

const STATUS_LABEL: Record<WsStatus, string> = {
  idle: "STANDBY",
  connecting: "DIALING",
  open: "ONLINE",
  closing: "CLOSING",
  closed: "OFFLINE",
  error: "FAULT",
};

const STATUS_DOT: Record<WsStatus, string> = {
  idle: "bg-obsidian-300",
  connecting: "bg-gold-400 animate-blink",
  open: "bg-ember-500 shadow-ember",
  closing: "bg-obsidian-300",
  closed: "bg-rose-500",
  error: "bg-rose-300 animate-blink",
};

interface HeaderProps {
  wsStatus: WsStatus;
  wsAttempts: number;
  clock: string;
  activeLabel?: string;
  onMinimize?: () => void;
  onMaximize?: () => void;
  onClose?: () => void;
}

export function Header({
  wsStatus,
  wsAttempts,
  clock,
  activeLabel,
  onMinimize,
  onMaximize,
  onClose,
}: HeaderProps) {
  return (
    <header
      data-tauri-drag-region
      className="relative flex h-12 items-center gap-4 border-b border-obsidian-700 bg-obsidian-850/95 px-4 backdrop-blur"
    >
      {/* Brand */}
      <div className="flex items-center gap-3" data-tauri-drag-region>
        <StagMark
          size={26}
          className="text-ember-500 animate-pulse [--tw-text-opacity:1]"
        />
        <div className="flex items-baseline gap-2" data-tauri-drag-region>
          <span className="font-display text-[15px] font-extrabold tracking-widest text-fg-primary">
            BANTZ
          </span>
          <span className="font-display text-[15px] font-extrabold tracking-widest text-ember-500">
            //
          </span>
          <span className="font-display text-[15px] font-extrabold tracking-widest text-fg-primary">
            OPERATIONS CENTER
          </span>
        </div>
      </div>

      <div className="h-5 w-px bg-obsidian-500" />

      {/* Connection status */}
      <div className="flex items-center gap-2 font-terminal text-[11px] tracking-wide text-fg-muted">
        <span
          className={`inline-block h-1.5 w-1.5 rounded-full ${STATUS_DOT[wsStatus]}`}
        />
        <span className="text-ember-300">WS</span>
        <span className="text-obsidian-200">·</span>
        <span className="text-fg-primary">{STATUS_LABEL[wsStatus]}</span>
        {wsStatus !== "open" && wsAttempts > 0 && (
          <span className="text-obsidian-300">· retry #{wsAttempts}</span>
        )}
      </div>

      {activeLabel && (
        <>
          <div className="h-5 w-px bg-obsidian-500" />
          <div className="font-terminal text-[11px] tracking-widest text-obsidian-200">
            <span className="text-obsidian-300">PAGE ·</span>{" "}
            <span className="text-fg-primary">{activeLabel}</span>
          </div>
        </>
      )}

      <div className="flex-1" data-tauri-drag-region />

      {/* Clock */}
      <div className="font-terminal text-[12px] tracking-wider text-ember-300">
        {clock}
      </div>

      {/* Window controls */}
      <div className="ml-2 flex items-center gap-1">
        <WinBtn onClick={onMinimize} label="minimize">
          <Minus size={12} strokeWidth={1.5} />
        </WinBtn>
        <WinBtn onClick={onMaximize} label="maximize">
          <Square size={10} strokeWidth={1.5} />
        </WinBtn>
        <WinBtn onClick={onClose} label="close" danger>
          <X size={12} strokeWidth={1.5} />
        </WinBtn>
      </div>
    </header>
  );
}

function WinBtn({
  children,
  onClick,
  label,
  danger,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  label: string;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`grid h-7 w-7 place-items-center border border-transparent text-fg-muted transition-colors duration-150 ease-bantz hover:border-obsidian-500 hover:text-fg-primary ${
        danger ? "hover:!border-rose-500 hover:!text-rose-300" : ""
      }`}
    >
      {children}
    </button>
  );
}
