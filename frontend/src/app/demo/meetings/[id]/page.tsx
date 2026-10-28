"use client";

import { useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { MeetingRoom } from "@/features/meetings/components/MeetingRoom";
import { useReplayRun } from "@/features/meetings/runtime/replay-run";

export default function DemoMeetingPage() {
    const params = useParams<{ id: string }>();
    const router = useRouter();
    const searchParams = useSearchParams();
    const run = useReplayRun();
    const meetingId = params.id;
    const initialTab = searchParams.get("tab") ?? undefined;
    const notCreated =
        run.checkpoint === run.session.initial_checkpoint ||
        run.session.meeting_id !== meetingId;

    useEffect(() => {
        if (notCreated) {
            router.replace("/demo");
        }
    }, [notCreated, router]);

    if (notCreated) {
        return (
            <main className="mx-auto max-w-3xl px-4 py-12">
                <p className="text-sm text-zinc-400">
                    This replay has not reached the meeting room yet. Returning to the
                    prepared board…
                </p>
            </main>
        );
    }

    return <MeetingRoom meetingId={meetingId} initialTab={initialTab} />;
}
