import type { ReactNode } from "react";

export function PageTitle({
  eyebrow,
  title,
  sub,
  right,
}: {
  eyebrow?: string;
  title: string;
  sub?: string;
  right?: ReactNode;
}) {
  return (
    <div className="mb-5 flex items-end justify-between border-b border-obsidian-700 pb-4">
      <div>
        {eyebrow && (
          <div className="mb-1.5 font-ui text-[10px] font-bold uppercase tracking-widest text-ember-500">
            {eyebrow}
          </div>
        )}
        <h1 className="font-display text-[28px] font-extrabold leading-none tracking-widest text-fg-primary">
          {title}
        </h1>
        {sub && (
          <p className="mt-2 font-terminal text-[12px] tracking-wide text-obsidian-200">
            {sub}
          </p>
        )}
      </div>
      {right}
    </div>
  );
}

export function PanelHeader({
  title,
  subtitle,
  right,
  accent = "ember",
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  accent?: "ember" | "gold" | "rose";
}) {
  const accentClass =
    accent === "gold" ? "text-gold-400" : accent === "rose" ? "text-rose-300" : "text-ember-500";
  return (
    <div className="flex items-center justify-between border-b border-obsidian-700 px-5 py-3">
      <div className="flex items-baseline gap-3">
        <span className={`font-ui text-[9px] font-bold uppercase tracking-widest ${accentClass}`}>
          §
        </span>
        <h3 className="font-ui text-[12px] font-bold uppercase tracking-[0.2em] text-fg-primary">
          {title}
        </h3>
        {subtitle && (
          <span className="font-terminal text-[10px] tracking-widest text-obsidian-300">
            {subtitle}
          </span>
        )}
      </div>
      {right}
    </div>
  );
}

export function SectionLabel({
  children,
  count,
  accent = "ember",
}: {
  children: ReactNode;
  count: number;
  accent?: "ember" | "gold" | "muted";
}) {
  const c =
    accent === "gold"
      ? "text-gold-400"
      : accent === "muted"
        ? "text-obsidian-200"
        : "text-ember-500";
  const r =
    accent === "gold"
      ? "from-gold-500"
      : accent === "muted"
        ? "from-obsidian-400"
        : "from-ember-500";
  return (
    <div className="flex items-center gap-3">
      <span className={`font-ui text-[10px] font-bold uppercase tracking-[0.25em] ${c}`}>
        {children}
      </span>
      <span className="font-terminal text-[10px] text-obsidian-300">[{count}]</span>
      <span className={`h-px flex-1 bg-gradient-to-r ${r} to-transparent`} />
    </div>
  );
}

export function Empty({ text }: { text: string }) {
  return (
    <div className="border border-dashed border-obsidian-700 bg-obsidian-850/30 px-5 py-4 font-terminal text-[12px] italic text-obsidian-300">
      {text}
    </div>
  );
}

export function fmtTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour12: false });
}

export function fmtMs(ts: number) {
  const d = new Date(ts);
  return (
    d.toLocaleTimeString([], { hour12: false }) +
    "." +
    String(d.getMilliseconds()).padStart(3, "0")
  );
}

export function timeAgo(ts: number) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return s + "s ago";
  const m = Math.floor(s / 60);
  if (m < 60) return m + "m ago";
  const h = Math.floor(m / 60);
  if (h < 24) return h + "h ago";
  return Math.floor(h / 24) + "d ago";
}
