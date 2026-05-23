import { useEffect, useRef, useState } from "react";
import { Search, Play, Pause } from "lucide-react";
import { useAppStore, type LogEntry, type LogSeverity } from "../store/useAppStore";
import { PageTitle, Empty, fmtMs } from "../components/primitives";

interface LogsPageProps {
  wsConnected?: boolean;
}

// Synthetic replay entries — shown when the backend is offline.
const FAKE_POOL: Omit<LogEntry, "id" | "t">[] = [
  { sev: "INFO",     src: "kernel",    msg: "heartbeat — 0 tasks pending" },
  { sev: "INFO",     src: "scheduler", msg: "directive check — all nominal" },
  { sev: "WARN",     src: "disk-mon",  msg: "/home partition at 91% — alert threshold not yet breached" },
  { sev: "INFO",     src: "comms",     msg: "synthetic stream active — backend not connected" },
  { sev: "INFO",     src: "ollama",    msg: "model idle — no pending inference" },
  { sev: "WARN",     src: "thermal",   msg: "GPU junction temp nominal — 68°C" },
  { sev: "INFO",     src: "ego",       msg: "mood: tolerant · displeasure: moderate" },
  { sev: "ERROR",    src: "redis",     msg: "high eviction rate — 142 keys/s (threshold 50)" },
  { sev: "CRITICAL", src: "systemd",   msg: "neo4j.service: container still halted" },
];

const SEVERITY: Record<LogSeverity, { color: string; badge: string }> = {
  INFO:     { color: "text-obsidian-100", badge: "text-obsidian-100 border-obsidian-400" },
  WARN:     { color: "text-gold-400",     badge: "text-gold-400 border-gold-500 bg-gold-500/10" },
  ERROR:    { color: "text-ember-500",    badge: "text-ember-500 border-ember-500 bg-ember-500/10" },
  CRITICAL: { color: "text-rose-300",     badge: "text-rose-300 border-rose-500 bg-rose-500/15" },
};

export function LogsPage({ wsConnected = false }: LogsPageProps) {
  const storeLogs = useAppStore((s) => s.logs);

  // Fake entries appended when WS is offline — kept in local state so they
  // don't pollute the store and disappear cleanly on reconnect.
  const [fakeLogs, setFakeLogs] = useState<LogEntry[]>([]);
  const fakeIdRef = useRef(0);

  const [filter, setFilter] = useState<"ALL" | LogSeverity>("ALL");
  const [search, setSearch] = useState("");
  const [paused, setPaused] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Run fake simulation only when the backend is not connected.
  useEffect(() => {
    if (wsConnected || paused) return;
    const id = window.setInterval(() => {
      const next = FAKE_POOL[Math.floor(Math.random() * FAKE_POOL.length)];
      setFakeLogs((prev) => [
        ...prev.slice(-40),
        { ...next, id: `f${++fakeIdRef.current}`, t: Date.now() },
      ]);
    }, 1800);
    return () => window.clearInterval(id);
  }, [wsConnected, paused]);

  // Drop fake entries once the backend comes online.
  useEffect(() => {
    if (wsConnected) setFakeLogs([]);
  }, [wsConnected]);

  // Merge store logs (real) + fake overlay, sorted by time.
  const allLogs: LogEntry[] = wsConnected
    ? storeLogs
    : [...storeLogs, ...fakeLogs].sort((a, b) => a.t - b.t);

  useEffect(() => {
    if (scrollRef.current && !paused) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [allLogs.length, paused]);

  const filtered = allLogs.filter((l) => {
    if (filter !== "ALL" && l.sev !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!l.msg.toLowerCase().includes(q) && !l.src.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const counts: Record<LogSeverity, number> = { INFO: 0, WARN: 0, ERROR: 0, CRITICAL: 0 };
  for (const l of allLogs) counts[l.sev]++;

  return (
    <div className="flex h-full flex-col">
      <PageTitle
        eyebrow={`${allLogs.length} entries · session`}
        title="KERNEL LOG"
        sub={
          wsConnected
            ? "Live audit stream from every Bantz subsystem."
            : "Synthetic stream — connect backend for live data."
        }
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
                {s !== "ALL" && <span className="ml-1 opacity-70">{counts[s as LogSeverity]}</span>}
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
                <span className="truncate text-velvet-200">{l.src}</span>
                <span>
                  <span className={`inline-block border px-1.5 py-0 font-ui text-[8px] font-bold tracking-widest ${s.badge}`}>
                    {l.sev}
                  </span>
                </span>
                <span className={`${s.color} break-all`}>{l.msg}</span>
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
            {filtered.length} of {allLogs.length} entries · filter{" "}
            <span className="text-ember-500">{filter}</span>
          </span>
          <span className="flex items-center gap-2">
            <span
              className={`inline-block h-1.5 w-1.5 rounded-full ${
                paused ? "bg-gold-400" : "animate-blink bg-ember-500"
              }`}
            />
            {paused
              ? "STREAM PAUSED"
              : wsConnected
                ? "LIVE · backend stream"
                : "SYNTHETIC · ~0.5 ev/s"}
          </span>
        </div>
      </section>
    </div>
  );
}
