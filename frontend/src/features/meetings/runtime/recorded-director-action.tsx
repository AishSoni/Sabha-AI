"use client";

/**
 * Recorded visitor follow-up (spec-18, simplified by spec-28).
 *
 * The prepared question is displayed exactly as approved and is never editable.
 * Sending it inserts the **You** turn; choosing the next speaker remains a
 * separate decision, so no participant is selected automatically.
 */
import { useState } from "react";
import { ChevronDown, ChevronUp, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAnchorRef } from "@/features/demo-tutorial";
import { useMeetingsRuntime } from "./context";

export function RecordedDirectorAction() {
    const runtime = useMeetingsRuntime();
    const followUpRef = useAnchorRef("room.followup");
    const replay = runtime.replay;
    const [busy, setBusy] = useState(false);
    const [questionExpanded, setQuestionExpanded] = useState(false);

    if (!replay) return null;

    const deckActive =
        replay.preparedBaseCheckpoint !== null &&
        replay.checkpoint === replay.preparedBaseCheckpoint;
    const prepared = deckActive
        ? (replay.preparedTurns ?? []).find(
              (turn) => turn.kind === "follow_up"
          )
        : undefined;
    if (prepared?.kind === "follow_up") {
        if (replay.playedTurnIds?.has(prepared.turn_id)) return null;
        return (
            <div ref={followUpRef} className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                    <p className="type-meta text-ink-secondary">
                        Your turn <span aria-hidden="true">·</span> Prepared question
                    </p>
                    <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        aria-expanded={questionExpanded}
                        aria-controls="prepared-follow-up-question"
                        onClick={() => setQuestionExpanded((open) => !open)}
                    >
                        {questionExpanded ? (
                            <ChevronUp className="mr-1 h-3.5 w-3.5" />
                        ) : (
                            <ChevronDown className="mr-1 h-3.5 w-3.5" />
                        )}
                        {questionExpanded ? 'Collapse' : 'Expand'}
                    </Button>
                </div>
                <div className="flex flex-wrap items-start gap-2">
                    <p
                        id="prepared-follow-up-question"
                        className={cn(
                            'min-w-0 flex-1 type-control whitespace-pre-wrap text-ink',
                            !questionExpanded && 'line-clamp-2'
                        )}
                    >
                        {prepared.question}
                    </p>
                    <Button
                        className="shrink-0"
                        busy={busy}
                        busyLabel="Sending"
                        onClick={async () => {
                            setBusy(true);
                            try {
                                await replay.sendFollowUp();
                            } finally {
                                setBusy(false);
                            }
                        }}
                    >
                        <Send className="mr-2 size-4" />
                        Send question
                    </Button>
                </div>
            </div>
        );
    }

    const actions = replay.legalActions().filter((action) => {
        if (
            action.intent.kind !== "director_follow_up" ||
            replay.settledIntents.has(action.intent.intent_id)
        ) {
            return false;
        }
        return true;
    });

    if (actions.length === 0) return null;

    const available = actions.filter((action) => action.available);
    const unavailable = actions.filter((action) => !action.available);

    return (
        <div className="space-y-2">
            <p className="type-meta text-ink-secondary">Your follow-up</p>
            {available.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                    {available.map((action) => {
                        const actionBusy =
                            busy && action === available[0];
                        return (
                            <Button
                                key={action.transition.transition_id}
                                busy={actionBusy}
                                busyLabel="Sending"
                                title={action.transition.explanation || undefined}
                                onClick={async () => {
                                    setBusy(true);
                                    try {
                                        await replay.startIntent(
                                            action.intent.intent_id
                                        );
                                    } finally {
                                        setBusy(false);
                                    }
                                }}
                            >
                                <Send className="mr-2 size-4" />
                                {action.transition.label ||
                                    action.intent.label ||
                                    "Send question"}
                            </Button>
                        );
                    })}
                </div>
            ) : null}
            {unavailable.length > 0 ? (
                <ul className="space-y-1 type-meta text-ink-muted">
                    {unavailable.map((action) => (
                        <li key={action.transition.transition_id}>
                            <span className="text-ink-secondary">
                                {action.transition.label ||
                                    action.intent.label ||
                                    "Prepared follow-up"}
                            </span>
                            {action.reason ? ` — ${action.reason}` : null}
                        </li>
                    ))}
                </ul>
            ) : null}
        </div>
    );
}
