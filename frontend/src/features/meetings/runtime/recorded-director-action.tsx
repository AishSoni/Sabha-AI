"use client";

/**
 * Recorded visitor follow-up (spec-18, simplified by spec-28).
 *
 * The prepared question is displayed exactly as approved and is never editable.
 * Sending it inserts the **You** turn; choosing the next speaker remains a
 * separate decision, so no participant is selected automatically.
 */
import { useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAnchorRef } from "@/features/demo-tutorial";
import { useMeetingsRuntime } from "./context";

export function RecordedDirectorAction() {
    const runtime = useMeetingsRuntime();
    const followUpRef = useAnchorRef("room.followup");
    const replay = runtime.replay;
    const [busy, setBusy] = useState(false);

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
            <Card ref={followUpRef} className="mb-4 p-4">
                <p className="type-control font-medium uppercase tracking-wide text-ink-muted">
                    Your turn
                </p>
                <label
                    className="mt-2 block type-meta font-medium text-ink-secondary"
                    htmlFor="prepared-follow-up-question"
                >
                    Prepared question
                </label>
                <textarea
                    id="prepared-follow-up-question"
                    readOnly
                    value={prepared.question}
                    rows={3}
                    className="mt-1 w-full resize-none rounded-control border border-control bg-surface-raised px-3 py-2 type-body text-ink"
                />
                <div className="mt-3">
                    <Button
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
            </Card>
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
        <Card className="mb-4 p-4">
            <p className="type-control font-medium uppercase tracking-wide text-ink-muted">
                Your follow-up
            </p>
            {available.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
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
                <ul className="mt-3 space-y-1 type-meta text-ink-muted">
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
        </Card>
    );
}
