import { useEffect, useMemo, useRef, useState } from "react";
import { Header } from "./components/Header";
import { Sidebar, PAGE_LABEL } from "./components/Sidebar";
import { PageHost } from "./components/PageHost";
import { ChatPage } from "./pages/ChatPage";
import { VitalsPage } from "./pages/VitalsPage";
import { TasksPage } from "./pages/TasksPage";
import { LogsPage } from "./pages/LogsPage";
import { AlertsPage } from "./pages/AlertsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { useWebSocket } from "./hooks/useWebSocket";
import { useAppStore } from "./store/useAppStore";

async function getWindow() {
  try {
    const m = await import("@tauri-apps/api/window");
    return m.getCurrentWindow();
  } catch {
    return null;
  }
}

const WS_URL = "ws://localhost:8765";

// Map Python log levels → UI severity labels.
const LEVEL_MAP: Record<string, "INFO" | "WARN" | "ERROR" | "CRITICAL"> = {
  debug: "INFO", info: "INFO", warning: "WARN", error: "ERROR", critical: "CRITICAL",
};

export default function App() {
  const [active, setActive] = useState<string>("chat");
  const [clock, setClock] = useState(() => fmtClock(new Date()));

  const pushChat        = useAppStore((s) => s.pushChat);
  const pushVital       = useAppStore((s) => s.pushVital);
  const setStreamingText = useAppStore((s) => s.setStreamingText);
  const pushLog         = useAppStore((s) => s.pushLog);
  const pushAlert       = useAppStore((s) => s.pushAlert);

  // Accumulates streaming tokens between "token" and "done" messages.
  const streamAccumRef = useRef<string>("");

  const { status, lastMessage, attempts, send } = useWebSocket({
    url: WS_URL,
    reconnectDelay: 2000,
  });

  // Wall clock
  useEffect(() => {
    const id = window.setInterval(() => setClock(fmtClock(new Date())), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Synthetic vitals — only run when the backend is not connected.
  useEffect(() => {
    if (status === "open") return;
    const id = window.setInterval(() => {
      pushVital({
        t: Date.now(),
        cpu: 12 + Math.round(Math.random() * 22),
        mem: 38 + Math.round(Math.random() * 4),
        disk: 91,
        net: 100 + Math.round(Math.random() * 300),
        ram_used: 0, ram_total: 0,
        disk_used: 0, disk_total: 0,
        vram_used: 0, vram_total: 0,
      });
    }, 1400);
    return () => window.clearInterval(id);
  }, [pushVital, status]);

  // Route incoming WS messages into the store.
  useEffect(() => {
    if (!lastMessage) return;
    const d = lastMessage.data as { type?: string; [k: string]: unknown } | undefined;
    if (!d || typeof d !== "object" || !d.type) return;

    switch (d.type) {

      case "vitals": {
        const v = d as {
          cpu: number; ram_used: number; ram_total: number;
          disk_used: number; disk_total: number;
          vram_used: number; vram_total: number;
        };
        const ramPct  = v.ram_total  > 0 ? (v.ram_used  / v.ram_total)  * 100 : 0;
        const diskPct = v.disk_total > 0 ? (v.disk_used / v.disk_total) * 100 : 0;
        pushVital({
          t:          Date.now(),
          cpu:        v.cpu,
          mem:        ramPct,
          disk:       diskPct,
          net:        0,
          ram_used:   v.ram_used,
          ram_total:  v.ram_total,
          disk_used:  v.disk_used,
          disk_total: v.disk_total,
          vram_used:  v.vram_used,
          vram_total: v.vram_total,
        });
        break;
      }

      case "token": {
        const tok = d as { text?: string };
        streamAccumRef.current += tok.text ?? "";
        setStreamingText(streamAccumRef.current);
        break;
      }

      case "done": {
        const final = streamAccumRef.current;
        streamAccumRef.current = "";
        setStreamingText(null);
        if (final.trim()) {
          pushChat({ role: "bantz", text: final });
        }
        break;
      }

      case "broadcast": {
        const b = d as { text?: string };
        pushChat({ role: "bantz", text: String(b.text ?? "") });
        break;
      }

      case "log": {
        const l = d as { msg: string; level: string };
        const colonIdx = l.msg.indexOf(": ");
        const src = colonIdx > 0 ? l.msg.slice(0, colonIdx) : "bantz";
        const msg = colonIdx > 0 ? l.msg.slice(colonIdx + 2) : l.msg;
        pushLog({
          t: Date.now(),
          sev: LEVEL_MAP[l.level] ?? "INFO",
          src,
          msg,
        });
        break;
      }

      case "alert": {
        const a = d as { title?: string; reason?: string; source?: string };
        const source = String(a.source ?? "bantz");
        pushAlert({
          severity: source === "observer" ? "critical" : "warning",
          category: "service",
          title:  String(a.title  ?? "Backend alert"),
          detail: String(a.reason ?? ""),
          ts:     Date.now(),
          source,
        });
        break;
      }

      // "pong" — intentionally ignored
      default:
        break;
    }
  }, [lastMessage, pushChat, pushVital, setStreamingText, pushLog, pushAlert]);

  // Connection status announcements
  useEffect(() => {
    if (status === "open") {
      streamAccumRef.current = "";
      setStreamingText(null);
      pushChat({ role: "system", text: `link established · ${WS_URL}` });
    } else if (status === "closed" && attempts > 0) {
      pushChat({
        role: "system",
        text: `link severed · attempting reconnect (${attempts})`,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  async function handleMinimize() { (await getWindow())?.minimize(); }
  async function handleMaximize() {
    const w = await getWindow();
    if (!w) return;
    (await w.isMaximized()) ? w.unmaximize() : w.maximize();
  }
  async function handleClose() { (await getWindow())?.close(); }

  function handleSend(text: string) {
    const ok = send({ type: "chat", text });
    if (!ok) {
      pushChat({
        role: "system",
        text: "backend unreachable — message queued locally only",
      });
    }
  }

  // Memoize so PageHost doesn't see a new map on every clock tick.
  const pages = useMemo(
    () => ({
      chat:     <ChatPage wsStatus={status} onSend={handleSend} />,
      vitals:   <VitalsPage />,
      tasks:    <TasksPage />,
      logs:     <LogsPage wsConnected={status === "open"} />,
      alerts:   <AlertsPage />,
      settings: <SettingsPage />,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [status],
  );

  return (
    <div className="bantz-texture relative flex h-screen w-screen flex-col overflow-hidden bg-obsidian-900 ring-1 ring-obsidian-700">
      <Header
        wsStatus={status}
        wsAttempts={attempts}
        clock={clock}
        activeLabel={PAGE_LABEL[active]}
        onMinimize={handleMinimize}
        onMaximize={handleMaximize}
        onClose={handleClose}
      />

      <div className="flex min-h-0 flex-1">
        <Sidebar active={active} onSelect={setActive} alertCount={2} />
        <main className="min-h-0 min-w-0 flex-1 overflow-hidden p-6">
          <PageHost active={active} pages={pages} />
        </main>
      </div>

      <footer className="flex h-6 items-center justify-between border-t border-obsidian-700 bg-obsidian-850/95 px-4 font-terminal text-[10px] tracking-wider text-obsidian-300">
        <span>BANTZ v0.1.0 · operations center · {PAGE_LABEL[active]?.toLowerCase()}</span>
        <span>
          {status === "open"
            ? "// transmission stable"
            : status === "connecting"
              ? "// dialing backend…"
              : "// awaiting transmission"}
        </span>
      </footer>
    </div>
  );
}

function fmtClock(d: Date) {
  return d.toLocaleTimeString([], { hour12: false });
}
