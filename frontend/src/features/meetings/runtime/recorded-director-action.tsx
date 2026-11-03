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
import { useAnchorRef } from "@/features/demo-tutorial/anchors";
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
            <Card
                ref={followUpRef}
                className="mb-4 border-zinc-800 bg-zinc-900/60 p-4"
            >
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                    Your turn
                </p>
                <label
                    className="mt-2 block text-xs font-medium text-zinc-400"
                    htmlFor="prepared-follow-up-question"
                >
                    Prepared question
                </label>
                <textarea
                    id="prepared-follow-up-question"
                    readOnly
                    value={prepared.question}
                    rows={3}
                    className="mt-1 w-full resize-none rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200"
                />
                <div className="mt-3">
                    <Button
                        className="bg-indigo-600 hover:bg-indigo-700"
                        disabled={busy}
                        onClick={async () => {
                            setBusy(true);
                            try {
                                await replay.sendFollowUp();
                            } finally {
                                setBusy(false);
                            }
                        }}
                    >
                        <Send className="mr-2 h-4 w-4" />
                        {busy ? "Sending…" : "Send question"}
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
        <Card className="mb-4 border-zinc-800 bg-zinc-900/60 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
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
                                className="bg-indigo-600 hover:bg-indigo-700"
                                disabled={actionBusy}
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
                                <Send className="mr-2 h-4 w-4" />
                                {actionBusy
                                    ? "Sending…"
                                    : action.transition.label ||
                                      action.intent.label ||
                                      "Send question"}
                            </Button>
                        );
                    })}
                </div>
            ) : null}
            {unavailable.length > 0 ? (
                <ul className="mt-3 space-y-1 text-xs text-zinc-500">
                    {unavailable.map((action) => (
                        <li key={action.transition.transition_id}>
                            <span className="text-zinc-400">
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
