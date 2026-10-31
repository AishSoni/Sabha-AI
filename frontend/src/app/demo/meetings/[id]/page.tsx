"use client";

import { useParams } from "next/navigation";
import { PracticeMeetingRoute } from "./practice-meeting-route";
import { RecordedMeetingRoute } from "./recorded-meeting-route";

export default function DemoMeetingPage() {
    const params = useParams<{ id: string }>();
    const meetingId = params.id;

    // The prefix is the typed provenance boundary: local IDs are resolved only
    // by the browser-memory adapter and never trigger a replay or live lookup.
    if (meetingId.startsWith("local-")) {
        return <PracticeMeetingRoute meetingId={meetingId} />;
    }

    return <RecordedMeetingRoute meetingId={meetingId} />;
}
