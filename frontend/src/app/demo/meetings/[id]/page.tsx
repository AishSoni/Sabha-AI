"use client";

import { useParams } from "next/navigation";
import { RecordedMeetingRoute } from "./recorded-meeting-route";

export default function DemoMeetingPage() {
    const params = useParams<{ id: string }>();
    return <RecordedMeetingRoute meetingId={params.id} />;
}
