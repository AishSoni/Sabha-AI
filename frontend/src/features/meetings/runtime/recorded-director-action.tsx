"use client";

/**
 * Recorded director follow-up (spec-18).
 *
 * The composer is a prepared message, not a free text field. It selects the
 * declared checkpoint intent and never posts to the live command graph.
 */
import { useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useActiveReplayIntentId } from "./active-intent";
import { useMeetingsRuntime } from "./context";

export function RecordedDirectorAction() {
    const runtime = useMeetingsRuntime();
    const replay = runtime.replay;
    const activeIntentId = useActiveReplayIntentId();
    const [busy, setBusy] = useState(false);

    const intent = replay?.intents.find(
        (item) =>
            item.kind === "director_follow_up" &&
            (activeIntentId === null || item.intent_id === activeIntentId)
    );

    if (!intent) return null;

    return (
        <Card className="mb-4 border-zinc-800 bg-zinc-900/60 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Prepared director follow-up
            </p>
            <p className="mt-1 text-sm text-zinc-300">
                A supported follow-up is available for this step. Editing is
                disabled so the recorded response stays aligned with the
                supplied record.
            </p>
            <Button
                className="mt-3 bg-indigo-600 hover:bg-indigo-700"
                disabled={busy}
                onClick={async () => {
                    if (!replay) return;
                    setBusy(true);
                    try {
                        await replay.startIntent(intent.intent_id);
                    } finally {
                        setBusy(false);
                    }
                }}
            >
                <Send className="mr-2 h-4 w-4" />
                {busy ? "Sending recorded follow-up…" : "Send prepared follow-up"}
            </Button>
        </Card>
    );
}
