import { useEffect, useState } from "react";
import { X, CheckCircle, XCircle, RefreshCw } from "lucide-react";
import { PanelHeader } from "./primitives";
import { useAppStore } from "../store/useAppStore";

// TODO(backend): Add WS message support in live_ui.py:
//   recv: { type: "doctor" }
//   send: { type: "doctor_result", checks: [{ label: string, ok: boolean, detail: string }] }
// Until then this panel uses mock data and ignores the WS response.

interface DoctorCheck {
  label: string;
  ok: boolean;
  detail: string;
}

const MOCK_CHECKS: DoctorCheck[] = [
  { label: "Python 3.11+",          ok: true,  detail: "mock data — backend endpoint pending" },
  { label: "Ollama reachable",       ok: false, detail: "mock — run bantz --doctor in terminal for real output" },
  { label: "BANTZ_OLLAMA_MODEL",     ok: true,  detail: "llama3.1:8b" },
  { label: "pydantic-settings",      ok: true,  detail: "installed" },
  { label: "aioconsole",             ok: true,  detail: "installed" },
  { label: "apscheduler",            ok: true,  detail: "installed" },
  { label: "SQLite DB",              ok: true,  detail: "~/.local/share/bantz/bantz.db" },
  { label: "MemPalace",              ok: true,  detail: "loaded (ChromaDB + SQLite KG)" },
  { label: "TELEGRAM_BOT_TOKEN",     ok: false, detail: "not set in .env" },
];

interface DoctorModalProps {
  onClose: () => void;
}

export function DoctorModal({ onClose }: DoctorModalProps) {
  const wsSend = useAppStore((s) => s.wsSend);
  const [checks, setChecks] = useState<DoctorCheck[]>([]);
  const [loading, setLoading] = useState(true);

  function runDoctor() {
    setLoading(true);
    setChecks([]);
    // Send the WS request; backend will reply with { type: "doctor_result" }
    // once implemented. Until then, fall back to mock data after a short delay.
    wsSend?.({ type: "doctor" });
    setTimeout(() => {
      setChecks(MOCK_CHECKS);
      setLoading(false);
    }, 750);
  }

  useEffect(() => {
    runDoctor();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const passed = checks.filter((c) => c.ok).length;
  const total  = checks.length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-obsidian-900/80 backdrop-blur-sm"
      onKeyDown={(e) => e.key === "Escape" && onClose()}
    >
      <div className="flex w-[540px] flex-col border border-obsidian-600 bg-obsidian-900 shadow-2xl">
        <PanelHeader
          title="System Doctor"
          subtitle="DIAGNOSTICS"
          right={
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={runDoctor}
                disabled={loading}
                title="Re-run checks"
                className="grid h-7 w-7 place-items-center border border-obsidian-500 text-obsidian-300 transition-colors hover:border-ember-500 hover:text-ember-500 disabled:opacity-40"
              >
                <RefreshCw
                  size={12}
                  strokeWidth={1.5}
                  className={loading ? "animate-spin" : ""}
                />
              </button>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="grid h-7 w-7 place-items-center border border-obsidian-500 text-obsidian-300 transition-colors hover:border-ember-500 hover:text-ember-500"
              >
                <X size={12} strokeWidth={1.5} />
              </button>
            </div>
          }
        />

        <div className="min-h-[300px] divide-y divide-obsidian-800">
          {loading ? (
            <div className="flex items-center justify-center py-16 font-terminal text-[12px] text-obsidian-300">
              <span className="animate-blink mr-2 text-ember-500">▌</span>
              Running diagnostics…
            </div>
          ) : (
            checks.map((c) => (
              <div key={c.label} className="flex items-start gap-4 px-5 py-3 hover:bg-obsidian-800/30">
                <span className="mt-0.5 flex-shrink-0">
                  {c.ok ? (
                    <CheckCircle size={14} strokeWidth={1.5} className="text-[#2E7D32]" />
                  ) : (
                    <XCircle size={14} strokeWidth={1.5} className="text-red-500" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-ui text-[12px] font-semibold uppercase tracking-wider text-fg-primary">
                    {c.label}
                  </div>
                  <div className="font-terminal text-[10px] text-obsidian-300">{c.detail}</div>
                </div>
              </div>
            ))
          )}
        </div>

        {!loading && (
          <div className="flex items-center justify-between border-t border-obsidian-700 bg-obsidian-850/60 px-5 py-3 font-terminal text-[11px]">
            <span>
              {passed === total ? (
                <span className="text-[#2E7D32]">All {total} checks passed.</span>
              ) : (
                <>
                  <span className="text-red-400">{total - passed} issue{total - passed !== 1 ? "s" : ""}</span>
                  <span className="text-obsidian-300"> · {passed}/{total} passed</span>
                </>
              )}
            </span>
            <span className="text-obsidian-500">// mock — backend TODO pending</span>
          </div>
        )}
      </div>
    </div>
  );
}
