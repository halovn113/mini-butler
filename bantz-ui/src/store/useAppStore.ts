import { create } from "zustand";

export interface ChatTurn {
  id: string;
  role: "bantz" | "user" | "system";
  text: string;
  ts: number;
}

export interface VitalSample {
  t: number; // unix ms
  cpu: number; // 0-100
  mem: number; // 0-100
  disk: number; // 0-100
  net: number; // KB/s
}

export interface Task {
  id: string;
  label: string;
  detail: string;
  status: "active" | "queued" | "done";
  since: string;
}

interface AppState {
  chat: ChatTurn[];
  vitals: VitalSample[];
  tasks: Task[];

  pushChat: (turn: Omit<ChatTurn, "id" | "ts"> & Partial<Pick<ChatTurn, "ts">>) => void;
  pushVital: (sample: VitalSample) => void;
  setTasks: (tasks: Task[]) => void;
}

let _id = 0;
const nid = () => `t${Date.now()}-${++_id}`;

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
    {
      id: "monitor-disk",
      label: "Monitor disk usage",
      detail: "91% → alerting at 95%",
      status: "active",
      since: "2h 14m",
    },
    {
      id: "email-triage",
      label: "Email triage",
      detail: "3 flagged for your attention",
      status: "active",
      since: "44m",
    },
    {
      id: "package-watch",
      label: "Package watch",
      detail: "Tracking 2 deliveries",
      status: "active",
      since: "6h 02m",
    },
    {
      id: "weekly-report",
      label: "Weekly report compilation",
      detail: "Scheduled · 18:00",
      status: "queued",
      since: "—",
    },
    {
      id: "schedule-reorg",
      label: "Schedule reorganisation",
      detail: "3 conflicts resolved",
      status: "done",
      since: "1d 4h",
    },
  ],

  pushChat: (turn) =>
    set((s) => ({
      chat: [
        ...s.chat,
        { id: nid(), ts: Date.now(), ...turn } as ChatTurn,
      ].slice(-200),
    })),
  pushVital: (sample) =>
    set((s) => ({ vitals: [...s.vitals, sample].slice(-60) })),
  setTasks: (tasks) => set({ tasks }),
}));

function seedVitals(): VitalSample[] {
  const now = Date.now();
  const out: VitalSample[] = [];
  for (let i = 29; i >= 0; i--) {
    const t = now - i * 1000;
    out.push({
      t,
      cpu: 10 + Math.round(Math.random() * 18 + Math.sin(i / 4) * 6),
      mem: 38 + Math.round(Math.random() * 4),
      disk: 91,
      net: 120 + Math.round(Math.random() * 240),
    });
  }
  return out;
}
