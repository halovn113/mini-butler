import { useEffect, useState, type ReactNode } from "react";

type PageMap = Record<string, ReactNode>;

/**
 * Cross-fades + slides between pages on `active` change.
 *
 * Why a custom transition (not framer-motion's AnimatePresence)?
 * - The shell re-renders frequently (clock, vitals tick). With AnimatePresence
 *   + mode="wait", every parent re-render risks confusing the exit/enter
 *   sequence. A simple `entered` toggle driven by setTimeout is bulletproof.
 * - Mirrors the proven approach from `Operations Center.html`.
 */
export function PageHost({
  active,
  pages,
}: {
  active: string;
  pages: PageMap;
}) {
  const [shown, setShown] = useState(active);
  const [entered, setEntered] = useState(true);

  // Fade out → swap → fade in.
  useEffect(() => {
    if (active === shown) return;
    setEntered(false);
    const id = window.setTimeout(() => setShown(active), 120);
    return () => window.clearTimeout(id);
  }, [active, shown]);

  // After swap, kick the in-class on next paint.
  useEffect(() => {
    setEntered(false);
    const id = window.setTimeout(() => setEntered(true), 30);
    return () => window.clearTimeout(id);
  }, [shown]);

  return (
    <div className={`h-full bz-page ${entered ? "bz-page-in" : ""}`}>
      {pages[shown]}
    </div>
  );
}
