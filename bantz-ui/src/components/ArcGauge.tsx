import { useEffect, useState } from "react";

/**
 * Animated semicircular arc gauge. Drops in for CPU / RAM / VRAM / DISK etc.
 * Plays a tween from previous → next value.
 */
export function ArcGauge({
  label,
  value,
  unit = "%",
  max = 100,
  tone = "ember",
  detail,
}: {
  label: string;
  value: number;
  unit?: string;
  max?: number;
  tone?: "ember" | "gold" | "rose" | "velvet";
  detail?: string;
}) {
  const [displayed, setDisplayed] = useState(value);

  useEffect(() => {
    const start = displayed;
    const end = value;
    const t0 = performance.now();
    const dur = 480;
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplayed(start + (end - start) * eased);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const pct = Math.max(0, Math.min(1, displayed / max));
  const r = 70;
  const C = Math.PI * r;
  const offset = C * (1 - pct);

  const toneColor =
    tone === "rose"
      ? "#CC1111"
      : tone === "gold"
        ? "#E2BB0B"
        : tone === "velvet"
          ? "#00BFFF"
          : "#FF4500";
  const glow =
    tone === "rose"
      ? "drop-shadow(0 0 8px rgba(204,17,17,0.6))"
      : tone === "gold"
        ? "drop-shadow(0 0 8px rgba(226,187,11,0.5))"
        : "drop-shadow(0 0 10px rgba(255,69,0,0.65))";

  return (
    <div className="relative flex flex-col items-center justify-end overflow-hidden border border-obsidian-700 bg-obsidian-850/80 px-3 pb-3 pt-5">
      <span className="absolute left-0 top-0 h-3 w-3 border-l border-t border-ember-500/60" />
      <span className="absolute right-0 top-0 h-3 w-3 border-r border-t border-ember-500/60" />
      <span className="absolute bottom-0 left-0 h-3 w-3 border-b border-l border-obsidian-500" />
      <span className="absolute bottom-0 right-0 h-3 w-3 border-b border-r border-obsidian-500" />

      <svg viewBox="0 0 180 100" width="100%" style={{ maxWidth: 200 }}>
        <path d="M 20 90 A 70 70 0 0 1 160 90" stroke="#1A1A1A" strokeWidth="9" fill="none" />
        {Array.from({ length: 11 }).map((_, i) => {
          const a = Math.PI - (i / 10) * Math.PI;
          const x1 = 90 + Math.cos(a) * 60;
          const y1 = 90 - Math.sin(a) * 60;
          const x2 = 90 + Math.cos(a) * 55;
          const y2 = 90 - Math.sin(a) * 55;
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#383838" strokeWidth="1" />;
        })}
        <path
          d="M 20 90 A 70 70 0 0 1 160 90"
          stroke={toneColor}
          strokeWidth="9"
          fill="none"
          strokeDasharray={C}
          strokeDashoffset={offset}
          style={{ filter: glow, transition: "stroke-dashoffset 60ms linear" }}
        />
        <path
          d="M 20 90 A 70 70 0 0 1 160 90"
          stroke={toneColor}
          strokeWidth="2"
          fill="none"
          opacity="0.25"
          strokeDasharray={C}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="-mt-7 flex flex-col items-center">
        <div
          className="font-display text-[28px] font-extrabold leading-none tracking-wide"
          style={{ color: toneColor }}
        >
          {displayed.toFixed(displayed >= 100 ? 0 : 1)}
          <span className="ml-0.5 text-[14px] opacity-70">{unit}</span>
        </div>
        <div className="mt-2 font-ui text-[9px] font-bold uppercase tracking-widest text-obsidian-200">
          {label}
        </div>
        {detail && (
          <div className="mt-0.5 font-terminal text-[10px] tracking-wide text-obsidian-300">
            {detail}
          </div>
        )}
      </div>
    </div>
  );
}
