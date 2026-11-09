import type { ContextStats } from '../api/decoders';

/**
 * Honest transcript-size inspection (spec-40 T29).
 *
 * The context endpoint counts saved messages, every participant prompt, and
 * the agenda against a fixed denominator. That is not the context a model
 * receives for a turn: turn execution selects one participant's prompt and a
 * character-bounded transcript. Presenting a percentage of 128k therefore
 * invented a capacity warning. This view keeps the useful token/count details
 * but names the scope as a rough estimate and never implies remaining model
 * capacity.
 */
export function ContextEstimate({ stats }: { stats: ContextStats }) {
    const hasBreakdown =
        typeof stats.message_tokens === 'number' &&
        typeof stats.system_tokens === 'number' &&
        typeof stats.agenda_tokens === 'number';

    return (
        <section className="mt-5" aria-labelledby="context-estimate-heading">
            <h3
                id="context-estimate-heading"
                className="type-meta-strong text-ink-secondary"
            >
                Saved-text token estimate
            </h3>
            <p className="mt-1 type-body type-tabular text-ink">
                ≈ {stats.current_tokens.toLocaleString()} tokens
            </p>
            <p className="mt-1 type-meta text-ink-muted">
                Rough estimate of saved messages, persona prompts, and agenda
                using one shared tokenizer. This is not model context usage or
                a context-window capacity.
            </p>
            <p className="mt-2 type-meta type-tabular text-ink-secondary">
                {stats.message_count.toLocaleString()} messages ·{' '}
                {stats.participant_count.toLocaleString()} participants
                {hasBreakdown
                    ? ` · Messages ${stats.message_tokens?.toLocaleString()} · Prompts ${stats.system_tokens?.toLocaleString()} · Agenda ${stats.agenda_tokens?.toLocaleString()}`
                    : null}
            </p>
            <p className="mt-1 type-meta text-ink-muted">
                Each participant&apos;s actual turn is bounded separately when
                it runs.
            </p>
        </section>
    );
}
