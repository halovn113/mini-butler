import { useEffect, useRef, useState } from "react";
import { Send, CornerDownLeft } from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import { PageTitle, PanelHeader, fmtTime } from "../components/primitives";
import type { WsStatus } from "../hooks/useWebSocket";

interface ChatPageProps {
  wsStatus: WsStatus;
  onSend: (text: string) => void;
}

export function ChatPage({ wsStatus, onSend }: ChatPageProps) {
  const chat          = useAppStore((s) => s.chat);
  const pushChat      = useAppStore((s) => s.pushChat);
  const streamingText = useAppStore((s) => s.streamingText);
  const [draft, setDraft] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  // Auto-scroll on new messages and on each streaming token.
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [chat.length, streamingText]);

  function submit() {
    const v = draft.trim();
    if (!v) return;
    pushChat({ role: "user", text: v });
    onSend(v);
    setDraft("");
  }

  return (
    <div className="flex h-full flex-col">
      <PageTitle
        eyebrow="Channel · 042"
        title="BROADCAST CHANNEL"
        sub="Direct duplex transmission with Bantz. Speak freely. He will judge silently."
        right={
          <div className="flex items-center gap-3 font-terminal text-[10px] tracking-widest text-obsidian-200">
            <span>
              <span className="text-ember-500">42</span> SENT
            </span>
            <span>
              <span className="text-gold-400">3</span> ACK
            </span>
            <span>
              SESSION <span className="text-fg-primary">14d 6h</span>
            </span>
          </div>
        }
      />

      <section className="flex min-h-0 flex-1 flex-col border border-obsidian-700 bg-obsidian-850/70">
        <PanelHeader
          title="Transmission Log"
          subtitle="ENCRYPTED · DUPLEX"
          right={
            <div className="flex items-center gap-2 font-terminal text-[10px] text-obsidian-300">
              <span className="inline-block h-1.5 w-1.5 animate-blink rounded-full bg-ember-500" />
              CARRIER ACTIVE
            </div>
          }
        />
        <div ref={ref} className="flex-1 space-y-3 overflow-y-auto px-6 py-5">
          {chat.map((t) => (
            <div key={t.id} className="grid grid-cols-[88px_1fr] gap-4">
              {t.role === "bantz" && (
                <>
                  <div className="pt-1 font-terminal text-[10px] tracking-widest text-ember-500">
                    BANTZ · {fmtTime(t.ts)}
                  </div>
                  <div className="border-l-2 border-ember-500 bg-obsidian-800/60 px-3 py-2 font-terminal text-[15px] leading-relaxed text-fg-primary">
                    {t.text}
                  </div>
                </>
              )}
              {t.role === "user" && (
                <>
                  <div className="pt-1 font-terminal text-[10px] tracking-widest text-gold-400">
                    YOU · {fmtTime(t.ts)}
                  </div>
                  <div className="border-l-2 border-gold-500/60 px-3 py-2 font-ui text-[14px] leading-relaxed text-fg-secondary">
                    {t.text}
                  </div>
                </>
              )}
              {t.role === "system" && (
                <>
                  <div className="pt-0.5 font-terminal text-[10px] tracking-widest text-obsidian-300">
                    SYS · {fmtTime(t.ts)}
                  </div>
                  <div className="font-terminal text-[12px] italic leading-relaxed text-obsidian-200">
                    {t.text}
                  </div>
                </>
              )}
            </div>
          ))}

          {/* Live streaming bubble — visible while backend is typing */}
          {streamingText && (
            <div className="grid grid-cols-[88px_1fr] gap-4">
              <div className="pt-1 font-terminal text-[10px] tracking-widest text-ember-500">
                BANTZ · {fmtTime(Date.now())}
              </div>
              <div className="border-l-2 border-ember-500/60 bg-obsidian-800/40 px-3 py-2 font-terminal text-[15px] leading-relaxed text-fg-primary">
                {streamingText}
                <span className="animate-blink ml-0.5 text-ember-500">▌</span>
              </div>
            </div>
          )}
        </div>
        <div className="border-t border-obsidian-700 bg-obsidian-900/60 px-5 py-3">
          <div className="flex items-center gap-3 border border-obsidian-500 bg-obsidian-850 px-3 py-2 transition-colors duration-150 ease-bantz focus-within:border-ember-500 focus-within:shadow-ember-soft">
            <span className="font-terminal text-[12px] text-ember-300">»</span>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder={
                wsStatus === "open"
                  ? "Address Bantz directly, sir."
                  : "Awaiting backend transmission…"
              }
              className="flex-1 bg-transparent font-terminal text-[14px] text-fg-primary placeholder:text-obsidian-300 focus:outline-none"
            />
            <span className="flex items-center gap-1 font-ui text-[9px] font-bold uppercase tracking-widest text-obsidian-300">
              <CornerDownLeft size={10} strokeWidth={1.5} /> Send
            </span>
            <button
              type="button"
              onClick={submit}
              disabled={!draft.trim()}
              className="grid h-7 w-7 place-items-center border border-ember-500 text-ember-500 transition-all duration-150 ease-bantz hover:bg-ember-500 hover:text-obsidian-900 disabled:cursor-not-allowed disabled:border-obsidian-500 disabled:text-obsidian-300 disabled:hover:bg-transparent"
              aria-label="Send"
            >
              <Send size={12} strokeWidth={1.5} />
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
