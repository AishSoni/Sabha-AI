"use client";

/**
 * Recorded participant intent (spec-17).
 *
 * The button selects a declared recorded operation and checkpoint; it never
 * posts a command or reaches the live vault/provider/cooldown graph.
 */
import { useState } from "react";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMeetingsRuntime } from "./context";
import type { ParticipantActionProps } from "./contract";

export function RecordedParticipantAction({
    participant,
    isActive,
    isQueued,
}: ParticipantActionProps) {
    const runtime = useMeetingsRuntime();
    const replay = runtime.replay;
    const [busy, setBusy] = useState(false);
    const intent = replay?.intents.find(
        (item) =>
            item.kind === "start_participant" &&
            item.participant_id === participant.id
    );

    if (!intent) return null;

    return (
        <Button
            variant="outline"
            size="sm"
            disabled={busy || isActive || isQueued}
            className="border-indigo-700 bg-indigo-950/40 text-indigo-300 hover:bg-indigo-900/40"
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
            <Play className="w-4 h-4 mr-1" />
            {busy ? "Preparing…" : intent.label || participant.name}
        </Button>
    );
}
