import { create } from "zustand";

export interface ChatTurn {
  id: string;
  role: "bantz" | "user" | "system";
  text: string;
  ts: number;
}

export interface VitalSample {
  t: number;
  cpu: number;        // %
  mem: number;        // % (ram_used/ram_total*100, for chart compat)
  disk: number;       // % (disk_used/disk_total*100)
  net: number;        // KB/s — still synthetic (backend doesn't push net I/O)
  ram_used: number;   // GB
  ram_total: number;  // GB
  disk_used: number;  // GB
  disk_total: number; // GB
  vram_used: number;  // MB
  vram_total: number; // MB
}

export interface Task {
  id: string;
  label: string;
  detail: string;
  status: "active" | "queued" | "done";
  since: string;
}

export type LogSeverity = "INFO" | "WARN" | "ERROR" | "CRITICAL";

export interface LogEntry {
  id: string;
  t: number;
  sev: LogSeverity;
  src: string;
  msg: string;
}

export type AlertSeverity = "critical" | "warning" | "info";
export type AlertCategory =
  | "thermal" | "disk" | "session" | "service"
  | "network" | "package";

export interface AlertItem {
  id: string;
  severity: AlertSeverity;
  category: AlertCategory;
  title: string;
  detail: string;
  ts: number;
  source: string;
}

interface AppState {
  chat: ChatTurn[];
  vitals: VitalSample[];
  tasks: Task[];
  streamingText: string | null;
  logs: LogEntry[];
  alerts: AlertItem[];

  pushChat: (turn: Omit<ChatTurn, "id" | "ts"> & Partial<Pick<ChatTurn, "ts">>) => void;
  pushVital: (sample: VitalSample) => void;
  setTasks: (tasks: Task[]) => void;
  setStreamingText: (text: string | null) => void;
  pushLog: (entry: Omit<LogEntry, "id">) => void;
  pushAlert: (alert: Omit<AlertItem, "id">) => void;
  dismissAlert: (id: string) => void;
  dismissAllAlerts: () => void;
}

let _id = 0;
const nid = () => `t${Date.now()}-${++_id}`;

// ── Seed data ─────────────────────────────────────────────────────────────

function seedVitals(): VitalSample[] {
  const now = Date.now();
  const out: VitalSample[] = [];
  for (let i = 29; i >= 0; i--) {
    const cpu = 10 + Math.round(Math.random() * 18 + Math.sin(i / 4) * 6);
    out.push({
      t: now - i * 1000,
      cpu,
      mem: 38 + Math.round(Math.random() * 4),
      disk: 91,
      net: 120 + Math.round(Math.random() * 240),
      ram_used: 0,
      ram_total: 0,
      disk_used: 0,
      disk_total: 0,
      vram_used: 0,
      vram_total: 0,
    });
  }
  return out;
}

const SEED_LOGS: Omit<LogEntry, "id">[] = (
  [
    { t: 0, sev: "INFO",     src: "kernel",    msg: "Bantz v0.1.0 initialised — kernel 6.8.0-rc4" },
    { t: 0, sev: "INFO",     src: "comms",     msg: "WebSocket carrier opened on :8765" },
    { t: 0, sev: "INFO",     src: "scheduler", msg: "loaded 8 directives from store" },
    { t: 0, sev: "WARN",     src: "disk-mon",  msg: "/home partition at 91% — alert threshold not yet breached" },
    { t: 0, sev: "INFO",     src: "ollama",    msg: "model warmed: llama3.1:70b (38s)" },
    { t: 0, sev: "ERROR",    src: "redis",     msg: "high eviction rate — 142 keys/s (threshold 50)" },
    { t: 0, sev: "INFO",     src: "telegram",  msg: "polling 2 chats · last update 4s ago" },
    { t: 0, sev: "WARN",     src: "thermal",   msg: "GPU junction temp climbing — 68°C, fan ramping" },
    { t: 0, sev: "CRITICAL", src: "systemd",   msg: "neo4j.service failed to start (exit 137 · OOM killer)" },
    { t: 0, sev: "INFO",     src: "kernel",    msg: "awaiting acknowledgement…" },
  ] as Omit<LogEntry, "id">[]
).map((l, i) => ({ ...l, t: Date.now() - (10 - i) * 1800 }));

const SEED_ALERTS: AlertItem[] = [
  {
    id: "a1", severity: "critical", category: "thermal", source: "thermal-monitor",
    ts: Date.now() - 4 * 60 * 1000,
    title: "GPU junction temperature climbing",
    detail: "68°C and rising at +0.4°C/min. Throttle threshold (87°C) projected in ~47 minutes if trend continues.",
  },
  {
    id: "a2", severity: "critical", category: "disk", source: "disk-mon",
    ts: Date.now() - 22 * 60 * 1000,
    title: "/home partition approaching saturation",
    detail: "412 / 460 GB consumed (91%). 47 GB attributable to ~/Videos/exports/final_FINAL_v3/. I have my opinions.",
  },
  {
    id: "a3", severity: "warning", category: "session", source: "ego",
    ts: Date.now() - 9 * 60 * 1000,
    title: "Marathon session detected",
    detail: "You have been at the terminal for 11h 23m without a break exceeding 4 minutes. This is, in my opinion, unsustainable.",
  },
  {
    id: "a4", severity: "warning", category: "service", source: "redis",
    ts: Date.now() - 28 * 60 * 1000,
    title: "Redis evicting keys aggressively",
    detail: "142 evictions/s (threshold 50). Cache pressure suggests undersized maxmemory or runaway producer.",
  },
  {
    id: "a5", severity: "warning", category: "network", source: "gemini",
    ts: Date.now() - 44 * 60 * 1000,
    title: "Gemini API quota at 87%",
    detail: "At current consumption rate the daily quota will exhaust in 2h 14m. Consider model fallback.",
  },
  {
    id: "a6", severity: "info", category: "package", source: "package-watch",
    ts: Date.now() - 2 * 3600 * 1000,
    title: "Package arriving Thursday",
    detail: 'Sender: yourself. Contents: coffee. Catalogued under "recurring vanities."',
  },
];

export const useAppStore = create<AppState>((set) => ({
  chat: [
    {
      id: nid(),
      role: "bantz",
      text: "Operations Center initialised. I am, as ever, mildly disappointed but operational.",
      ts: Date.now() - 4000,
    },
    {
      id: nid(),
      role: "system",
      text: "awaiting backend transmission on ws://localhost:8765 …",
      ts: Date.now() - 2000,
    },
  ],
  vitals: seedVitals(),
  tasks: [
    { id: "monitor-disk",  label: "Monitor disk usage",          detail: "91% → alerting at 95%",         status: "active", since: "2h 14m" },
    { id: "email-triage",  label: "Email triage",                detail: "3 flagged for your attention",   status: "active", since: "44m" },
    { id: "package-watch", label: "Package watch",               detail: "Tracking 2 deliveries",          status: "active", since: "6h 02m" },
    { id: "weekly-report", label: "Weekly report compilation",   detail: "Scheduled · 18:00",              status: "queued", since: "—" },
    { id: "schedule-reorg",label: "Schedule reorganisation",     detail: "3 conflicts resolved",           status: "done",   since: "1d 4h" },
  ],
  streamingText: null,
  logs: SEED_LOGS.map((l) => ({ ...l, id: nid() })),
  alerts: SEED_ALERTS,

  pushChat: (turn) =>
    set((s) => ({
      chat: [...s.chat, { id: nid(), ts: Date.now(), ...turn } as ChatTurn].slice(-200),
    })),

  pushVital: (sample) =>
    set((s) => ({ vitals: [...s.vitals, sample].slice(-60) })),

  setTasks: (tasks) => set({ tasks }),

  setStreamingText: (text) => set({ streamingText: text }),

  pushLog: (entry) =>
    set((s) => ({
      logs: [...s.logs, { ...entry, id: nid() }].slice(-200),
    })),

  pushAlert: (alert) =>
    set((s) => ({
      alerts: [{ ...alert, id: nid() }, ...s.alerts],
    })),

  dismissAlert: (id) =>
    set((s) => ({ alerts: s.alerts.filter((a) => a.id !== id) })),

  dismissAllAlerts: () => set({ alerts: [] }),
}));
