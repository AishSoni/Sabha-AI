'use client';

import { useEffect, useState } from 'react';
import { DEMO_SESSION_STORAGE_KEY } from '@/features/demo/types';
import { BOND_SNAPSHOT_DATE } from '@/features/demo/journeyClient';

/** Persistent DEMO watermark + recorded-analysis context. Never covers controls. */
export function DemoWatermark() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const check = () => {
      try {
        setActive(!!sessionStorage.getItem(DEMO_SESSION_STORAGE_KEY));
      } catch {
        setActive(false);
      }
    };
    check();
    window.addEventListener('storage', check);
    const t = window.setInterval(check, 1000);
    return () => {
      window.removeEventListener('storage', check);
      window.clearInterval(t);
    };
  }, []);

  if (!active) return null;

  return (
    <>
      <div
        aria-label="DEMO watermark"
        className="pointer-events-none fixed bottom-3 right-3 z-[60] rounded border border-amber-400/40 bg-zinc-950/80 px-2 py-1 text-[11px] font-bold tracking-widest text-amber-300"
      >
        DEMO
      </div>
      <div className="pointer-events-none fixed bottom-3 left-3 z-[60] max-w-[70vw] truncate rounded bg-zinc-950/80 px-2 py-1 text-[11px] text-zinc-400">
        Recorded analysis · Not financial advice · Sources as of {BOND_SNAPSHOT_DATE}
      </div>
    </>
  );
}
