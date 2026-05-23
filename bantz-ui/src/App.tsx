import { useEffect, useMemo, useState } from "react";
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

export default function App() {
  const [active, setActive] = useState<string>("chat");
  const [clock, setClock] = useState(() => fmtClock(new Date()));
  const pushChat = useAppStore((s) => s.pushChat);
  const pushVital = useAppStore((s) => s.pushVital);

  const { status, lastMessage, attempts, send } = useWebSocket({
    url: WS_URL,
    reconnectDelay: 2000,
  });

  // Wall clock
  useEffect(() => {
    const id = window.setInterval(() => setClock(fmtClock(new Date())), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Fake vitals tick — replaced by real samples when backend sends `vital`.
  useEffect(() => {
    const id = window.setInterval(() => {
      pushVital({
        t: Date.now(),
        cpu: 12 + Math.round(Math.random() * 22),
        mem: 38 + Math.round(Math.random() * 4),
        disk: 91,
        net: 100 + Math.round(Math.random() * 300),
      });
    }, 1400);
    return () => window.clearInterval(id);
  }, [pushVital]);

  // Route incoming WS messages into the store.
  useEffect(() => {
    if (!lastMessage) return;
    const d = lastMessage.data as { type?: string; [k: string]: unknown } | undefined;
    if (d && typeof d === "object" && d.type) {
      switch (d.type) {
        case "broadcast":
          pushChat({ role: "bantz", text: String(d.text ?? "") });
          break;
        case "vital":
          pushVital({
            t: Number(d.t ?? Date.now()),
            cpu: Number(d.cpu ?? 0),
            mem: Number(d.mem ?? 0),
            disk: Number(d.disk ?? 0),
            net: Number(d.net ?? 0),
          });
          break;
        default:
          break;
      }
    } else {
      pushChat({ role: "system", text: lastMessage.raw });
    }
  }, [lastMessage, pushChat, pushVital]);

  // Connection announcements
  useEffect(() => {
    if (status === "open") {
      pushChat({ role: "system", text: `link established · ${WS_URL}` });
    } else if (status === "closed" && attempts > 0) {
      pushChat({
        role: "system",
        text: `link severed · attempting reconnect (${attempts})`,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  async function handleMinimize() {
    (await getWindow())?.minimize();
  }
  async function handleMaximize() {
    const w = await getWindow();
    if (!w) return;
    (await w.isMaximized()) ? w.unmaximize() : w.maximize();
  }
  async function handleClose() {
    (await getWindow())?.close();
  }

  function handleSend(text: string) {
    const ok = send({ type: "user", text, ts: Date.now() });
    if (!ok) {
      pushChat({
        role: "system",
        text: "backend unreachable — message queued locally only",
      });
    }
  }

  // Memoize so the PageHost doesn't see a new map on every clock tick.
  const pages = useMemo(
    () => ({
      chat:     <ChatPage wsStatus={status} onSend={handleSend} />,
      vitals:   <VitalsPage />,
      tasks:    <TasksPage />,
      logs:     <LogsPage />,
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
