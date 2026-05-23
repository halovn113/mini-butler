import {
  Radio,
  Activity,
  ListChecks,
  ScrollText,
  ShieldAlert,
  Settings as SettingsIcon,
} from "lucide-react";

export interface NavItem {
  key: string;
  label: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
}

export const NAV: NavItem[] = [
  { key: "chat",   label: "Broadcast Channel", icon: Radio },
  { key: "vitals", label: "System Vitals",     icon: Activity },
  { key: "tasks",  label: "Directives",        icon: ListChecks },
  { key: "logs",   label: "Kernel Log",        icon: ScrollText },
  { key: "alerts", label: "Anomaly Watch",     icon: ShieldAlert },
];

interface SidebarProps {
  active: string;
  onSelect: (key: string) => void;
  alertCount?: number;
}

export function Sidebar({ active, onSelect, alertCount = 0 }: SidebarProps) {
  return (
    <aside className="flex w-[68px] flex-col items-center justify-between border-r border-obsidian-700 bg-obsidian-850/90 py-3">
      <nav className="flex flex-col items-center gap-1">
        {NAV.map((n) => {
          const Icon = n.icon;
          const isActive = active === n.key;
          const showBadge = n.key === "alerts" && alertCount > 0;
          return (
            <button
              key={n.key}
              type="button"
              onClick={() => onSelect(n.key)}
              aria-label={n.label}
              title={n.label}
              className={`group relative grid h-11 w-11 place-items-center border transition-all duration-150 ease-bantz ${
                isActive
                  ? "border-ember-500 bg-ember-500/10 text-ember-500 shadow-ember-soft"
                  : "border-transparent text-obsidian-200 hover:border-obsidian-500 hover:text-ember-300"
              }`}
            >
              <Icon size={18} strokeWidth={1.5} />
              {isActive && (
                <span className="absolute -left-3 top-1/2 h-6 w-0.5 -translate-y-1/2 bg-ember-500 shadow-ember" />
              )}
              {showBadge && (
                <span className="absolute -top-1 -right-1 grid h-4 min-w-[16px] place-items-center bg-rose-500 px-1 font-ui text-[9px] font-bold text-fg-primary">
                  {alertCount}
                </span>
              )}
              <span className="pointer-events-none absolute left-[110%] z-50 hidden whitespace-nowrap border border-obsidian-500 bg-obsidian-850 px-2 py-1 font-ui text-[10px] font-bold uppercase tracking-widest text-fg-primary group-hover:block">
                {n.label}
              </span>
            </button>
          );
        })}
      </nav>

      <button
        type="button"
        onClick={() => onSelect("settings")}
        aria-label="Settings"
        title="Settings"
        className={`grid h-11 w-11 place-items-center border transition-colors duration-150 ease-bantz ${
          active === "settings"
            ? "border-gold-500 bg-gold-500/10 text-gold-400"
            : "border-transparent text-obsidian-200 hover:border-obsidian-500 hover:text-gold-400"
        }`}
      >
        <SettingsIcon size={18} strokeWidth={1.5} />
      </button>
    </aside>
  );
}

export const PAGE_LABEL: Record<string, string> = {
  chat: "Broadcast Channel",
  vitals: "System Vitals",
  tasks: "Directives",
  logs: "Kernel Log",
  alerts: "Anomaly Watch",
  settings: "Settings",
};
