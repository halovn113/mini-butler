import { useState } from "react";
import { Plus, ChevronDown, ChevronRight, MoreHorizontal } from "lucide-react";
import { PageTitle, SectionLabel, Empty } from "../components/primitives";

type Priority = "critical" | "high" | "medium" | "low";
type Status = "active" | "queued" | "done";

interface Task {
  id: string;
  title: string;
  detail: string;
  priority: Priority;
  status: Status;
  progress: number;
  eta: string;
}

const TASKS: Task[] = [
  { id:"t1", title:"Monitor disk usage on /home",   detail:"alert threshold 95% · currently 91%",       priority:"high",     status:"active", progress:62,  eta:"watching" },
  { id:"t2", title:"Triage inbound correspondence", detail:"3 of 17 flagged for personal attention",    priority:"medium",   status:"active", progress:28,  eta:"continuous" },
  { id:"t3", title:"Compile weekly status report",  detail:"3 of 5 contributing systems pending",       priority:"high",     status:"active", progress:78,  eta:"18:00 today" },
  { id:"t4", title:"Audit recurring cron failures", detail:"backup.sh — 14 consecutive misses",         priority:"critical", status:"queued", progress:0,   eta:"this evening" },
  { id:"t5", title:"Provision second Ollama model", detail:"qwen2.5-coder · pending disk reclamation",  priority:"low",      status:"queued", progress:0,   eta:"after disk audit" },
  { id:"t6", title:"Reorganise meeting schedule",   detail:"3 conflicts resolved, 0 inconveniences",    priority:"medium",   status:"done",   progress:100, eta:"completed 1d 4h" },
  { id:"t7", title:"Apply security patches",        detail:"14 packages updated · 0 regressions",       priority:"high",     status:"done",   progress:100, eta:"completed 2d 1h" },
  { id:"t8", title:"Procure additional coffee",     detail:"Thursday delivery · same regrettable blend",priority:"low",      status:"done",   progress:100, eta:"completed 1h ago" },
];

const PRIORITY: Record<Priority, { color: string; border: string; bg: string; label: string }> = {
  critical: { color:"text-rose-300",     border:"border-rose-500",     bg:"bg-rose-500/10",  label:"CRITICAL" },
  high:     { color:"text-ember-500",    border:"border-ember-500",    bg:"bg-ember-500/10", label:"HIGH" },
  medium:   { color:"text-gold-400",     border:"border-gold-500",     bg:"bg-gold-500/10",  label:"MEDIUM" },
  low:      { color:"text-obsidian-200", border:"border-obsidian-500", bg:"bg-obsidian-800", label:"LOW" },
};

function TaskRow({ t }: { t: Task }) {
  const p = PRIORITY[t.priority];
  return (
    <div
      className={`group border ${
        t.status === "active"
          ? "border-ember-500/30"
          : t.status === "queued"
            ? "border-gold-500/30"
            : "border-obsidian-700"
      } bg-obsidian-800/60 px-5 py-4 transition-colors hover:border-ember-500 ${t.status === "done" ? "opacity-60" : ""}`}
    >
      <div className="flex items-start gap-4">
        <span
          className={`mt-1.5 block h-2 w-2 flex-shrink-0 rounded-full ${
            t.status === "active"
              ? "bg-ember-500 shadow-ember"
              : t.status === "queued"
                ? "bg-gold-400"
                : "bg-obsidian-400"
          }`}
        />
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-3">
            <div className="font-ui text-[14px] font-semibold uppercase tracking-wide text-fg-primary">
              {t.title}
            </div>
            <span
              className={`border px-1.5 py-0.5 font-ui text-[8px] font-bold uppercase tracking-widest ${p.color} ${p.border} ${p.bg}`}
            >
              {p.label}
            </span>
          </div>
          <div className="font-terminal text-[12px] text-obsidian-200">{t.detail}</div>
          {t.status === "active" && (
            <div className="mt-3 flex items-center gap-3">
              <div className="relative h-1.5 flex-1 overflow-hidden bg-obsidian-700">
                <div
                  className="absolute inset-y-0 left-0 bg-ember-500 shadow-ember transition-all"
                  style={{ width: `${t.progress}%` }}
                />
                {[25, 50, 75].map((v) => (
                  <span
                    key={v}
                    className="absolute inset-y-0 w-px bg-obsidian-900/80"
                    style={{ left: `${v}%` }}
                  />
                ))}
              </div>
              <span className="w-10 text-right font-terminal text-[11px] text-ember-300">
                {t.progress}%
              </span>
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 text-right">
          <div className="font-terminal text-[10px] uppercase tracking-widest text-obsidian-300">
            {t.eta}
          </div>
          <button
            type="button"
            className="grid h-6 w-6 place-items-center border border-obsidian-500 text-obsidian-200 opacity-0 transition-opacity hover:border-ember-500 hover:text-ember-500 group-hover:opacity-100"
          >
            <MoreHorizontal size={12} strokeWidth={1.5} />
          </button>
        </div>
      </div>
    </div>
  );
}

export function TasksPage() {
  const [filter, setFilter] = useState<"all" | Priority>("all");
  const [showDone, setShowDone] = useState(false);

  const visible = TASKS.filter((t) => filter === "all" || t.priority === filter);
  const active = visible.filter((t) => t.status === "active");
  const queued = visible.filter((t) => t.status === "queued");
  const done = visible.filter((t) => t.status === "done");

  return (
    <div className="flex h-full flex-col">
      <PageTitle
        eyebrow={`${active.length} active · ${queued.length} queued`}
        title="DIRECTIVES"
        sub="Standing instructions Bantz operates without further consultation."
        right={
          <button
            type="button"
            className="flex items-center gap-2 border border-ember-500 bg-ember-500/10 px-4 py-2 font-ui text-[10px] font-bold uppercase tracking-widest text-ember-500 transition-all hover:bg-ember-500 hover:text-obsidian-900"
          >
            <Plus size={14} strokeWidth={1.5} /> New Directive
          </button>
        }
      />

      <div className="mb-4 flex items-center gap-2">
        {(["all", "critical", "high", "medium", "low"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setFilter(k)}
            className={`border px-3 py-1.5 font-ui text-[10px] font-bold uppercase tracking-widest transition-all ${
              filter === k
                ? "border-ember-500 bg-ember-500/15 text-ember-500"
                : "border-obsidian-500 text-obsidian-200 hover:border-ember-500 hover:text-ember-300"
            }`}
          >
            {k === "all" ? "All" : k.charAt(0).toUpperCase() + k.slice(1)}
          </button>
        ))}
        <div className="flex-1" />
        <div className="font-terminal text-[10px] tracking-widest text-obsidian-300">
          {visible.length} OF {TASKS.length} SHOWN
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">
        <section>
          <SectionLabel count={active.length} accent="ember">
            Active
          </SectionLabel>
          <div className="mt-2 space-y-2">
            {active.length === 0 && <Empty text="No active directives." />}
            {active.map((t) => (
              <TaskRow key={t.id} t={t} />
            ))}
          </div>
        </section>

        <section>
          <SectionLabel count={queued.length} accent="gold">
            Queued
          </SectionLabel>
          <div className="mt-2 space-y-2">
            {queued.length === 0 && <Empty text="Nothing queued." />}
            {queued.map((t) => (
              <TaskRow key={t.id} t={t} />
            ))}
          </div>
        </section>

        <section>
          <button
            type="button"
            onClick={() => setShowDone((s) => !s)}
            className="group flex items-center gap-2"
          >
            {showDone ? (
              <ChevronDown size={14} className="text-obsidian-200 group-hover:text-ember-500" />
            ) : (
              <ChevronRight size={14} className="text-obsidian-200 group-hover:text-ember-500" />
            )}
            <SectionLabel count={done.length} accent="muted">
              Completed
            </SectionLabel>
          </button>
          {showDone && (
            <div className="mt-2 space-y-2">
              {done.map((t) => (
                <TaskRow key={t.id} t={t} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
