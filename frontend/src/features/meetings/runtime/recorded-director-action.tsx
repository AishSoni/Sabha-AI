"use client";

/**
 * Recorded director follow-up (spec-18, expanded by spec-26).
 *
 * The composer offers the prepared follow-up for the current guided step. It
 * never posts to the live command graph and never accepts free text.
 */
import { useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
    isActionAllowedByGuide,
    useGuideActions,
} from "../guide/guide-actions";
import { useMeetingsRuntime } from "./context";

export function RecordedDirectorAction() {
    const runtime = useMeetingsRuntime();
    const guide = useGuideActions();
    const replay = runtime.replay;
    const [busyIntent, setBusyIntent] = useState<string | null>(null);

    if (!replay) return null;

    const actions = replay.legalActions().filter((action) => {
        if (
            action.intent.kind !== "director_follow_up" ||
            replay.settledIntents.has(action.intent.intent_id)
        ) {
            return false;
        }
        return isActionAllowedByGuide(action, guide);
    });

    if (actions.length === 0) return null;

    const available = actions.filter((action) => action.available);
    const unavailable = actions.filter((action) => !action.available);

    return (
        <Card className="mb-4 border-zinc-800 bg-zinc-900/60 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Prepared director follow-up
            </p>
            <p className="mt-1 text-sm text-zinc-300">
                {available.length > 1
                    ? "More than one follow-up is supported for this moment. Choose the question you want the board to answer."
                    : "A supported follow-up is available for this step. Editing is disabled so the recorded response stays aligned with the supplied record."}
            </p>
            {available.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                    {available.map((action) => {
                        const busy = busyIntent === action.intent.intent_id;
                        return (
                            <Button
                                key={action.transition.transition_id}
                                className="bg-indigo-600 hover:bg-indigo-700"
                                disabled={busy}
                                title={action.transition.explanation || undefined}
                                onClick={async () => {
                                    setBusyIntent(action.intent.intent_id);
                                    try {
                                        await replay.startIntent(
                                            action.intent.intent_id
                                        );
                                    } finally {
                                        setBusyIntent(null);
                                    }
                                }}
                            >
                                <Send className="mr-2 h-4 w-4" />
                                {busy
                                    ? "Sending recorded follow-up…"
                                    : action.transition.label ||
                                      action.intent.label ||
                                      "Send prepared follow-up"}
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
