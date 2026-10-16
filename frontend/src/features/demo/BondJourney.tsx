'use client';

import { useEffect, useRef, useState } from 'react';

import { JOURNEY_STEPS, useBondJourney } from './useBondJourney';
import { BOND_SNAPSHOT_DATE, VERIFIED_ISIN } from './journeyClient';

const STEP_LABELS: Record<string, { title: string; action: string }> = {
  start_walkthrough: { title: 'Orientation', action: 'Begin' },
  inspect_board: { title: 'Meet the board', action: 'Inspect the board' },
  submit_bond_question: { title: 'Ask about the bond', action: 'Submit question' },
  ask_credit_analysis: { title: 'Credit analysis', action: 'Ask credit analysis' },
  ask_structure_downside: {
    title: 'Structure and downside',
    action: 'Ask structure analysis',
  },
  queue_verification_question: {
    title: 'Queue a verification question',
    action: 'Queue verification question',
  },
  ask_treasury_analysis: {
    title: 'Treasury analysis',
    action: 'Ask treasury analysis',
  },
  agree_verification_agenda: {
    title: 'Agree the verification agenda',
    action: 'Record agreement',
  },
  end_walkthrough: { title: 'Executive brief', action: 'End walkthrough' },
  explore_followup: { title: 'Guided exploration', action: 'Explore follow-up' },
};

export function BondJourney() {
  const { state, start, advance, refreshQueue, editQueued, reset, leave } =
    useBondJourney();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const announcedStep = useRef<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    if (state.phase === 'active' && state.currentStep !== announcedStep.current) {
      announcedStep.current = state.currentStep;
      headingRef.current?.focus();
    }
  }, [state.phase, state.currentStep]);

  if (state.phase === 'idle' || state.phase === 'failed') {
    return (
      <main className="max-w-2xl mx-auto w-full p-4">
        <h1 className="text-lg font-semibold text-white">
          Single-bond review walkthrough
        </h1>
        <p className="text-sm text-zinc-300 mt-2">
          A guided review of {VERIFIED_ISIN} (source snapshot{' '}
          {BOND_SNAPSHOT_DATE}). Historical scripted analysis for your own
          verification — not financial advice.
        </p>
        <button
          type="button"
          onClick={() => void start()}
          className="mt-4 rounded bg-white px-4 py-2 text-sm font-medium text-zinc-900"
        >
          Start walkthrough
        </button>
        {state.error && (
          <p role="alert" className="text-sm text-amber-400 mt-3">
            {state.error}{' '}
            <button
              type="button"
              onClick={() => void start()}
              className="underline"
            >
              Retry
            </button>
          </p>
        )}
      </main>
    );
  }

  if (state.phase === 'starting') {
    return (
      <main className="max-w-2xl mx-auto w-full p-4">
        <p role="status" className="text-sm text-zinc-300">
          Preparing the {VERIFIED_ISIN} board…
        </p>
      </main>
    );
  }

  const stepIndex = state.currentStep
    ? JOURNEY_STEPS.indexOf(
        state.currentStep as (typeof JOURNEY_STEPS)[number],
      )
    : -1;
  const step = state.currentStep ? STEP_LABELS[state.currentStep] : null;

  return (
    <main className="max-w-2xl mx-auto w-full p-4">
      <p className="text-xs text-zinc-400">
        {VERIFIED_ISIN} · snapshot {BOND_SNAPSHOT_DATE} · meeting{' '}
        {state.meetingId} · step {stepIndex + 1} of {JOURNEY_STEPS.length}
      </p>
      <h1
        ref={headingRef}
        tabIndex={-1}
        className="text-lg font-semibold text-white mt-1"
      >
        {step?.title ?? 'Walkthrough'}
      </h1>
      <p className="text-xs text-zinc-400 mt-1" aria-live="polite">
        {state.completed.length} of {JOURNEY_STEPS.length} steps complete
      </p>

      <ol className="mt-4 space-y-3" aria-label="Walkthrough transcript">
        {state.turns.map((turn, index) => (
          <li
            key={`${turn.action_id}-${index}`}
            className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3"
          >
            <p className="text-xs text-zinc-500">
              {STEP_LABELS[turn.action_id]?.title ?? turn.action_id}
              {turn.specialist ? ` · ${turn.specialist}` : ''}
            </p>
            <p className="text-sm text-zinc-100 mt-1 whitespace-pre-wrap">
              {turn.final_text}
            </p>
            {turn.citations && turn.citations.length > 0 && (
              <ul className="mt-2 space-y-1">
                {turn.citations.map((citation) => (
                  <li
                    key={citation.source}
                    className="text-xs text-zinc-400"
                  >
                    {citation.title} — {citation.source}
                  </li>
                ))}
              </ul>
            )}
            {turn.votes && turn.votes.length > 0 && (
              <ul className="mt-2 space-y-1" aria-label="Ending votes">
                {turn.votes.map((vote) => (
                  <li key={vote.participant} className="text-xs text-zinc-400">
                    {vote.participant}: {vote.vote} — ready to summarize, not an
                    investment verdict
                  </li>
                ))}
              </ul>
            )}
            {turn.brief && (
              <p className="text-xs text-zinc-400 mt-2">
                Executive brief recorded with source references and open
                verification steps.
              </p>
            )}
          </li>
        ))}
      </ol>

      {state.currentStep && step && (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void advance(state.currentStep!)}
            className="rounded bg-white px-4 py-2 text-sm font-medium text-zinc-900"
          >
            {step.action}
          </button>
          <button
            type="button"
            onClick={() => void reset()}
            className="rounded border border-zinc-700 px-4 py-2 text-sm text-zinc-200"
          >
            Reset walkthrough
          </button>
          <button
            type="button"
            onClick={leave}
            className="rounded border border-zinc-800 px-4 py-2 text-sm text-zinc-400"
          >
            Leave
          </button>
        </div>
      )}

      {state.queue.length > 0 && (
        <section aria-label="Verification queue" className="mt-4">
          <h2 className="text-sm font-semibold text-white">
            Queued verification questions ({state.queue.length})
          </h2>
          <p className="text-xs text-zinc-400 mt-1">
            <button
              type="button"
              onClick={() => void refreshQueue()}
              className="underline"
            >
              Refresh from server
            </button>{' '}
            — entries dispatch in order once the active turn finishes.
          </p>
          <ol className="mt-2 space-y-2">
            {state.queue.map((entry) => (
              <li
                key={entry.entry_id}
                className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3"
              >
                <p className="text-sm text-zinc-100">{entry.content}</p>
                <div className="mt-2 flex gap-2">
                  <label
                    htmlFor={`demo-queue-edit-${entry.entry_id}`}
                    className="sr-only"
                  >
                    Edit queued question
                  </label>
                  <input
                    id={`demo-queue-edit-${entry.entry_id}`}
                    value={drafts[entry.entry_id] ?? entry.content}
                    onChange={(e) =>
                      setDrafts((d) => ({
                        ...d,
                        [entry.entry_id]: e.target.value,
                      }))
                    }
                    className="flex-1 rounded bg-zinc-900 border border-zinc-700 text-sm text-white p-2"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      void editQueued(
                        entry.entry_id,
                        drafts[entry.entry_id] ?? entry.content,
                        entry.revision,
                      )
                    }
                    className="rounded border border-zinc-700 px-3 py-1 text-sm text-zinc-200"
                  >
                    Save
                  </button>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {state.error && (
        <p role="alert" className="text-sm text-amber-400 mt-3">
          {state.error}
        </p>
      )}

      <footer className="mt-6 border-t border-zinc-800 pt-3">
        <p className="text-xs text-zinc-500">
          Historical scripted analysis of {VERIFIED_ISIN}. Subjective analysis
          for your informed decision — not financial advice. Verify independently
          before any decision.
        </p>
      </footer>
    </main>
  );
}
