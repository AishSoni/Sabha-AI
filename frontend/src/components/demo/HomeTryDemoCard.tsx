'use client';

// Home entry of the recorded demo walkthrough (UI00/J00). Starts the demo
// session WITHOUT creating a meeting: the guide overlay then walks the
// visitor through settings/stacks/roster before the meeting attach step.

import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { startDemoWalkthroughSession } from '@/lib/demoGuideApi';
import { saveDemoToken } from '@/features/demo/journeyClient';
import { useDemoGuideStore } from '@/stores/demoGuideStore';

async function startWalkthrough(): Promise<void> {
  const started = await startDemoWalkthroughSession();
  saveDemoToken(started.credential);
  await useDemoGuideStore.getState().startWalkthrough();
}

export function HomeTryDemoCard() {
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);

  const handleClick = async () => {
    if (starting || started) return;
    setStarting(true);
    setError(null);
    try {
      await startWalkthrough();
      setStarted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Demo start failed');
    } finally {
      setStarting(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      data-demo-anchor="home.try-demo"
      disabled={starting}
      className="group w-full text-left disabled:opacity-60"
      aria-label="Try the demo"
    >
      <div className="h-full rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 transition-all duration-300 hover:border-purple-500/50 hover:shadow-lg hover:shadow-purple-500/10">
        <div className="flex items-center justify-between text-lg font-semibold text-white">
          {started ? 'Demo walkthrough started' : 'Try the demo'}
          <ArrowRight className="h-4 w-4 text-zinc-600 transition-all group-hover:translate-x-1 group-hover:text-purple-400" />
        </div>
        <p className="mt-2 text-sm text-zinc-400">
          {error
            ? error
            : started
              ? 'Follow the guide overlay - next stops: settings, stacks, roster, then the meeting.'
              : 'Guided bond review on real meeting routes'}
        </p>
        <p className="mt-4 text-sm text-zinc-500">
          {starting ? 'Starting…' : ''}
          {started ? '' : 'Recorded analysis · INE001A07RW5 · Snapshot 2020-07-31.'}
        </p>
      </div>
    </button>
  );
}
