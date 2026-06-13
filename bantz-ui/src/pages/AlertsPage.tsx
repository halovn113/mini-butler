import {
  ShieldAlert, ShieldCheck, AlertTriangle, Info, X, Check,
  type LucideIcon,
} from "lucide-react";
import { PageTitle, timeAgo } from "../components/primitives";
import { useAppStore, type Anomaly, type AlertSeverity } from "../store/useAppStore";

const SEV: Record<AlertSeverity, { bar: string; text: string; border: string; bg: string; label: string }> = {
  critical: { bar:"bg-rose-500",   text:"text-rose-300",   border:"border-rose-500/60",   bg:"bg-rose-500/5",   label:"CRITICAL" },
  warning:  { bar:"bg-gold-500",   text:"text-gold-400",   border:"border-gold-500/40",   bg:"bg-gold-500/5",   label:"WARNING" },
  info:     { bar:"bg-velvet-200", text:"text-velvet-200", border:"border-velvet-200/40", bg:"bg-velvet-200/5", label:"INFO" },
};

const SEV_ICON: Record<AlertSeverity, LucideIcon> = {
  critical: ShieldAlert, warning: AlertTriangle, info: Info,
};

export function AlertsPage() {
  const anomalies      = useAppStore((s) => s.anomalies);
  const dismissAnomaly = useAppStore((s) => s.dismissAnomaly);
  const snoozeAnomaly  = useAppStore((s) => s.snoozeAnomaly);
  const setActivePage  = useAppStore((s) => s.setActivePage);
  const pushChat       = useAppStore((s) => s.pushChat);
  const wsSend         = useAppStore((s) => s.wsSend);
  const dismissAll     = () => anomalies.forEach((a) => dismissAnomaly(a.id));

  // Ask Bantz about an anomaly in the Broadcast Channel and switch to it.
  const investigate = (a: Anomaly) => {
    const text = `investigate: ${a.title} — ${a.description}`;
    pushChat({ role: "user", text });        // show the request in the channel
    wsSend?.({ type: "chat", text });          // backend handles type "chat"
    setActivePage("chat");                     // navigate to Broadcast Channel
  };

  const counts: Record<AlertSeverity, number> = { critical: 0, warning: 0, info: 0 };
  for (const a of anomalies) counts[a.severity]++;

  return (
    <div className="flex h-full flex-col">
      <PageTitle
        eyebrow={`${anomalies.length} active`}
        title="ANOMALY WATCH"
        sub="Bantz raises alerts at his own discretion. He is rarely wrong, though often condescending."
        right={
          <button
            type="button"
            onClick={dismissAll}
            className="flex items-center gap-2 border border-obsidian-500 bg-obsidian-800 px-4 py-2 font-ui text-[10px] font-bold uppercase tracking-widest text-obsidian-200 transition-colors hover:border-ember-500 hover:text-ember-500"
          >
            <Check size={12} strokeWidth={1.5} /> Dismiss All
          </button>
        }
      />

      <div className="mb-4 grid grid-cols-3 gap-3">
        {([
          { sev: "critical" as const, label: "CRITICAL", Icon: ShieldAlert },
          { sev: "warning"  as const, label: "WARNING",  Icon: AlertTriangle },
          { sev: "info"     as const, label: "INFO",     Icon: Info },
        ]).map((row) => {
          const st = SEV[row.sev];
          const Icon = row.Icon;
          return (
            <div key={row.sev} className={`flex items-center gap-4 border ${st.border} ${st.bg} px-5 py-4`}>
              <div className={`grid h-12 w-12 place-items-center border ${st.border} ${st.text}`}>
                <Icon size={22} strokeWidth={1.5} />
              </div>
              <div className="flex-1">
                <div className={`font-display text-[32px] font-extrabold leading-none ${st.text}`}>
                  {counts[row.sev]}
                </div>
                <div className="mt-1 font-ui text-[10px] font-bold uppercase tracking-widest text-obsidian-200">
                  {row.label}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {anomalies.length === 0 && (
          <div className="grid h-full place-items-center">
            <div className="text-center">
              <ShieldCheck size={48} className="mx-auto mb-3 text-[#2E7D32]" />
              <div className="font-ui text-[14px] font-bold uppercase tracking-widest text-fg-primary">
                No anomalies detected.
              </div>
              <div className="mt-2 font-terminal text-[12px] italic text-obsidian-200">
                "I have detected nothing untoward. This is, in my experience, a temporary condition."
              </div>
            </div>
          </div>
        )}

        {anomalies.map((a: Anomaly) => {
          const st   = SEV[a.severity];
          const Icon = SEV_ICON[a.severity];
          return (
            <div key={a.id} className={`relative flex items-stretch border ${st.border} ${st.bg}`}>
              <div className={`w-1.5 flex-shrink-0 ${st.bar}`} />
              <div className="flex-1 px-5 py-4">
                <div className="mb-1 flex items-center gap-3">
                  <span className={`grid h-6 w-6 place-items-center border ${st.border} ${st.text}`}>
                    <Icon size={12} strokeWidth={1.5} />
                  </span>
                  <div className={`font-ui text-[13px] font-bold uppercase tracking-wider ${st.text}`}>
                    {a.title}
                  </div>
                  <span className={`border px-1.5 py-0.5 font-ui text-[8px] font-bold uppercase tracking-widest ${st.text} ${st.border} ${st.bg}`}>
                    {st.label}
                  </span>
                  <div className="flex-1" />
                  <span className="font-terminal text-[10px] text-obsidian-300">
                    {timeAgo(a.timestamp)} · {a.source}
                  </span>
                </div>
                <p className="pl-9 font-terminal text-[13px] leading-relaxed text-fg-secondary">
                  {a.description}
                </p>
                <div className="mt-3 flex items-center gap-2 pl-9">
                  <button
                    type="button"
                    onClick={() => investigate(a)}
                    className="border border-obsidian-500 bg-obsidian-800 px-3 py-1 font-ui text-[9px] font-bold uppercase tracking-widest text-obsidian-200 transition-colors hover:border-ember-500 hover:text-ember-500"
                  >
                    Investigate
                  </button>
                  <button
                    type="button"
                    onClick={() => snoozeAnomaly(a.id)}
                    className="border border-obsidian-500 bg-obsidian-800 px-3 py-1 font-ui text-[9px] font-bold uppercase tracking-widest text-obsidian-200 transition-colors hover:border-gold-500 hover:text-gold-400"
                  >
                    Snooze 1h
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={() => dismissAnomaly(a.id)}
                className="m-3 grid h-7 w-7 self-start place-items-center border border-obsidian-500 text-obsidian-200 transition-colors hover:border-rose-500 hover:text-rose-300"
                aria-label="Dismiss"
              >
                <X size={12} strokeWidth={1.5} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
