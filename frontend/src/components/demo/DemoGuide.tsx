'use client';

// Route-persistent generic onboarding overlay (Part D section 4D). Renders
// package content verbatim, positions by frontend-owned anchor keys, never
// owns timers, never covers controls, and only advances journey steps from
// real application events.

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useDemoGuideStore } from '@/stores/demoGuideStore';
import { hasDemoSessionState } from '@/lib/demoGuideSession';
import { routeForAnchor } from '@/lib/demoGuideSteps';

function anchorHighlight(target: string | null): Element | null {
  if (!target || typeof document === 'undefined') return null;
  return document.querySelector(`[data-demo-anchor="${target}"]`);
}

export function DemoGuide() {
  const pathname = usePathname();
  const router = useRouter();
  const [sessionActive, setSessionActive] = useState(false);
  const steps = useDemoGuideStore(s => s.steps);
  const currentIndex = useDemoGuideStore(s => s.currentIndex);
  const status = useDemoGuideStore(s => s.status);
  const paused = useDemoGuideStore(s => s.paused);
  const active = useDemoGuideStore(s => s.active);
  const instrumentIsin = useDemoGuideStore(s => s.instrumentIsin);
  const disclosure = useDemoGuideStore(s => s.disclosure);
  const hydrate = useDemoGuideStore(s => s.hydrate);
  const next = useDemoGuideStore(s => s.next);
  const back = useDemoGuideStore(s => s.back);
  const pause = useDemoGuideStore(s => s.pause);
  const resume = useDemoGuideStore(s => s.resume);
  const exit = useDemoGuideStore(s => s.exit);
  const markJourneyAction = useDemoGuideStore(s => s.markJourneyAction);
  const createFollowupFork = useDemoGuideStore(s => s.createFollowupFork);

  useEffect(() => {
    const check = () => setSessionActive(hasDemoSessionState());
    check();
    window.addEventListener('storage', check);
    const interval = window.setInterval(check, 2000);
    return () => {
      window.removeEventListener('storage', check);
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (sessionActive) {
      void hydrate();
    }
  }, [sessionActive, hydrate]);

  const step = steps[currentIndex] ?? null;
  const finished = steps.length > 0 && currentIndex >= steps.length;
  const anchorRoute = step?.anchor ? routeForAnchor(step.anchor) : null;
  const onAnchorRoute = !anchorRoute || (Boolean(pathname) && anchorRoute === pathname);

  useEffect(() => {
    if (!onAnchorRoute || paused || finished) return;
    const element = anchorHighlight(step?.anchor ?? null);
    if (element) {
      element.scrollIntoView({ block: 'nearest' });
      element.setAttribute('data-demo-guide-highlight', 'on');
      return () => element.removeAttribute('data-demo-guide-highlight');
    }
    return undefined;
  }, [step, onAnchorRoute, paused, finished]);

  const handleGoToRoute = useCallback(() => {
    if (anchorRoute) router.push(anchorRoute);
  }, [anchorRoute, router]);

  if (!active || paused || status === 'unavailable') {
    if (active && paused && status !== 'unavailable') {
      return (
        <button
          type="button"
          onClick={resume}
          className="fixed bottom-10 left-3 z-[70] rounded bg-amber-500 px-3 py-1 text-xs font-semibold text-zinc-950 shadow-lg"
        >
          Resume guidance
        </button>
      );
    }
    return null;
  }

  const show = sessionActive || active;

  return show ? (
    <aside
      role="note"
      aria-live="polite"
      aria-label="Demo walkthrough guidance"
      className="fixed bottom-10 left-3 z-[70] w-[calc(100vw-1.5rem)] max-w-sm rounded-lg border border-amber-400/30 bg-zinc-950/95 p-3 text-sm text-zinc-100 shadow-xl"
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-widest text-amber-300">
          Demo guide {steps.length > 0 ? `${Math.min(currentIndex + 1, steps.length)}/${steps.length}` : ''}
        </p>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={pause}
            className="rounded px-2 py-0.5 text-xs text-zinc-300 hover:bg-zinc-800"
          >
            Pause
          </button>
          <button
            type="button"
            onClick={() => {
              exit();
              router.push('/');
            }}
            className="rounded px-2 py-0.5 text-xs text-zinc-300 hover:bg-zinc-800"
          >
            Exit
          </button>
        </div>
      </div>
      {instrumentIsin ? (
        <p className="mb-1 text-[11px] text-zinc-400">
          Recorded walkthrough {instrumentIsin} · {disclosure?.slice(0, 80)}
        </p>
      ) : null}
      {finished ? (
        <p className="text-zinc-200">
          Walkthrough complete. Explore follow-up questions, or exit to clear demo state.
        </p>
      ) : !step ? (
        <p className="text-zinc-400">Loading walkthrough…</p>
      ) : (
        <>
          <p className="mb-1 font-semibold">{step.title}</p>
          <p className="mb-2 text-zinc-300">{step.why}</p>
          {step.tech ? (
            <details className="mb-2 text-xs text-zinc-400">
              <summary className="cursor-pointer select-none text-zinc-300">How it works</summary>
              <p className="mt-1 whitespace-pre-line">{step.tech}</p>
            </details>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={back} className="rounded px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800">
              Back
            </button>
            {!onAnchorRoute ? (
              <button
                type="button"
                onClick={handleGoToRoute}
                className="rounded bg-amber-500 px-2 py-1 text-xs font-bold text-zinc-950 hover:bg-amber-400"
              >
                Go to page
              </button>
            ) : null}
            {step.key === 'J05' ? (
              <button
                type="button"
                onClick={() => void markJourneyAction('queue_verification_question')}
                className="rounded bg-amber-500 px-2 py-1 text-xs font-bold text-zinc-950 hover:bg-amber-400"
              >
                I ran the queue exercise
              </button>
            ) : null}
            {step.key === 'J09' ? (
              <button
                type="button"
                onClick={() =>
                  void createFollowupFork((forkId) => router.push(`/meetings/${forkId}`))
                }
                className="rounded bg-amber-500 px-2 py-1 text-xs font-bold text-zinc-950 hover:bg-amber-400"
              >
                Open follow-up fork
              </button>
            ) : null}
            <button
              type="button"
              onClick={next}
              className="rounded bg-amber-500 px-2 py-1 text-xs font-bold text-zinc-950 hover:bg-amber-400"
            >
              Next
            </button>
          </div>
        </>
      )}
    </aside>
  ) : null;
}
