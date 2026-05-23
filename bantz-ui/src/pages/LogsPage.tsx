import { useEffect, useRef, useState } from "react";
import { Search, Play, Pause } from "lucide-react";
import { PageTitle, Empty, fmtMs } from "../components/primitives";

type Severity = "INFO" | "WARN" | "ERROR" | "CRITICAL";

interface LogEntry {
  id: number | string;
  t: number;
  sev: Severity;
  src: string;
  msg: string;
}

const LOG_SEED: Omit<LogEntry, "id" | "t">[] = [
  { sev: "INFO",     src: "kernel",    msg: "Bantz v0.1.0 initialised — kernel 6.8.0-rc4" },
  { sev: "INFO",     src: "comms",     msg: "WebSocket carrier opened on :8765" },
  { sev: "INFO",     src: "scheduler", msg: "loaded 8 directives from store" },
  { sev: "WARN",     src: "disk-mon",  msg: "/home partition at 91% — alert threshold not yet breached" },
  { sev: "INFO",     src: "ollama",    msg: "model warmed: llama3.1:70b (38s)" },
  { sev: "ERROR",    src: "redis",     msg: "high eviction rate — 142 keys/s (threshold 50)" },
  { sev: "INFO",     src: "telegram",  msg: "polling 2 chats · last update 4s ago" },
  { sev: "WARN",     src: "thermal",   msg: "GPU junction temp climbing — 68°C, fan ramping" },
  { sev: "INFO",     src: "comms",     msg: 'broadcast 041 transmitted — "CPU temperature nominal"' },
  { sev: "CRITICAL", src: "systemd",   msg: "neo4j.service failed to start (exit 137 · OOM killer)" },
  { sev: "INFO",     src: "scheduler", msg: "directive t3 'weekly report' progress 78%" },
  { sev: "WARN",     src: "cron",      msg: "backup.sh — 14 consecutive misses · last success 14d ago" },
  { sev: "INFO",     src: "comms",     msg: 'broadcast 042 transmitted — "meeting rescheduled"' },
  { sev: "INFO",     src: "ego",       msg: "mood: tolerant · displeasure: moderate" },
  { sev: "ERROR",    src: "gemini",    msg: "rate limit warning: 87% of quota consumed" },
  { sev: "INFO",     src: "kernel",    msg: "awaiting acknowledgement..." },
];

const SEVERITY: Record<Severity, { color: string; badge: string }> = {
  INFO:     { color: "text-obsidian-100", badge: "text-obsidian-100 border-obsidian-400" },
  WARN:     { color: "text-gold-400",     badge: "text-gold-400 border-gold-500 bg-gold-500/10" },
  ERROR:    { color: "text-ember-500",    badge: "text-ember-500 border-ember-500 bg-ember-500/10" },
  CRITICAL: { color: "text-rose-300",     badge: "text-rose-300 border-rose-500 bg-rose-500/15" },
};

export function LogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>(() =>
    LOG_SEED.map((l, i) => ({ ...l, id: i, t: Date.now() - (LOG_SEED.length - i) * 1300 })),
  );
  const [filter, setFilter] = useState<"ALL" | Severity>("ALL");
  const [search, setSearch] = useState("");
  const [paused, setPaused] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (paused) return;
    const id = window.setInterval(() => {
      const next = LOG_SEED[Math.floor(Math.random() * LOG_SEED.length)];
      setLogs((prev) =>
        [...prev.slice(-200), { ...next, id: Date.now() + Math.random(), t: Date.now() }],
      );
    }, 1800);
    return () => window.clearInterval(id);
  }, [paused]);

  useEffect(() => {
    if (scrollRef.current && !paused) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs.length, paused]);

  const filtered = logs.filter((l) => {
    if (filter !== "ALL" && l.sev !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!l.msg.toLowerCase().includes(q) && !l.src.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const counts: Record<Severity, number> = { INFO: 0, WARN: 0, ERROR: 0, CRITICAL: 0 };
  for (const l of logs) counts[l.sev]++;

  return (
    <div className="flex h-full flex-col">
      <PageTitle
        eyebrow={`${logs.length} entries · session`}
        title="KERNEL LOG"
        sub="Continuous audit stream from every Bantz subsystem."
        right={
          <button
            type="button"
            onClick={() => setPaused((p) => !p)}
            className={`flex items-center gap-2 border px-4 py-2 font-ui text-[10px] font-bold uppercase tracking-widest transition-all ${
              paused
                ? "border-gold-500 bg-gold-500/10 text-gold-400"
                : "border-ember-500 bg-ember-500/10 text-ember-500"
            }`}
          >
            {paused ? <Play size={12} /> : <Pause size={12} />}
            {paused ? "Resume Stream" : "Pause Stream"}
          </button>
        }
      />

      <div className="mb-3 flex items-center gap-3 border border-obsidian-700 bg-obsidian-850/70 px-4 py-3">
        <Search size={14} className="text-obsidian-300" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="filter by source or message…"
          className="flex-1 bg-transparent font-terminal text-[12px] text-fg-primary placeholder:text-obsidian-300 focus:outline-none"
        />
        <div className="h-5 w-px bg-obsidian-500" />
        <div className="flex items-center gap-1">
          {(["ALL", "INFO", "WARN", "ERROR", "CRITICAL"] as const).map((s) => {
            const isActive = filter === s;
            const sev = s === "ALL" ? null : SEVERITY[s];
            return (
              <button
                key={s}
                type="button"
                onClick={() => setFilter(s)}
                className={`border px-2 py-1 font-ui text-[9px] font-bold uppercase tracking-widest transition-all ${
                  isActive
                    ? s === "ALL"
                      ? "border-ember-500 bg-ember-500/15 text-ember-500"
                      : sev!.badge
                    : "border-obsidian-500 text-obsidian-300 hover:border-obsidian-300 hover:text-fg-primary"
                }`}
              >
                {s}
                {s !== "ALL" && <span className="ml-1 opacity-70">{counts[s as Severity]}</span>}
              </button>
            );
          })}
        </div>
      </div>

      <section className="flex min-h-0 flex-1 flex-col border border-obsidian-700 bg-obsidian-900/60">
        <div className="grid grid-cols-[140px_110px_90px_1fr] border-b border-obsidian-700 px-4 py-2 font-ui text-[9px] font-bold uppercase tracking-widest text-obsidian-300">
          <span>Timestamp</span>
          <span>Source</span>
          <span>Severity</span>
          <span>Message</span>
        </div>
        <div ref={scrollRef} className="flex-1 overflow-y-auto font-terminal text-[12px]">
          {filtered.map((l) => {
            const s = SEVERITY[l.sev];
            return (
              <div
                key={l.id}
                className="grid grid-cols-[140px_110px_90px_1fr] gap-x-3 border-b border-obsidian-800/60 px-4 py-1 hover:bg-obsidian-800/40"
              >
                <span className="text-obsidian-300">{fmtMs(l.t)}</span>
                <span className="text-velvet-200">{l.src}</span>
                <span>
                  <span className={`inline-block border px-1.5 py-0 font-ui text-[8px] font-bold tracking-widest ${s.badge}`}>
                    {l.sev}
                  </span>
                </span>
                <span className={s.color}>{l.msg}</span>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="p-4">
              <Empty text="No entries match the current filter." />
            </div>
          )}
        </div>
        <div className="flex items-center justify-between border-t border-obsidian-700 px-4 py-2 font-terminal text-[10px] text-obsidian-300">
          <span>
            {filtered.length} of {logs.length} entries · filter{" "}
            <span className="text-ember-500">{filter}</span>
          </span>
          <span className="flex items-center gap-2">
            <span
              className={`inline-block h-1.5 w-1.5 rounded-full ${paused ? "bg-gold-400" : "animate-blink bg-ember-500"}`}
            />
            {paused ? "STREAM PAUSED" : "STREAMING · ~0.5 ev/s"}
          </span>
        </div>
      </section>
    </div>
  );
}
