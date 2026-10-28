"use client";

import type { ReactNode } from "react";
import { meetingClient } from "../api/client";
import { closingClient } from "../api/closing-client";
import { closingKeys } from "../api/closing-keys";
import { meetingKeys } from "../api/keys";
import { turnClient } from "../api/turn-client";
import { turnKeys } from "../api/turn-keys";
import type { MeetingsRuntime } from "./contract";
import { ALL_MEETING_CAPABILITIES } from "./contract";
import { MeetingsRuntimeProvider } from "./context";
import { LiveDocumentsPanel } from "./live-documents-panel";
import { LiveParticipantAction } from "./live-participant-action";
import { LiveSummaryPanel } from "./live-summary-panel";
import {
    LIVE_RUNTIME_SCOPE,
    RuntimeScopeProvider,
} from "@/shared/runtime/scope";

const liveKeys = {
    meetingList: () => meetingKeys.list(),
    meetingDetail: (meetingId: string) => meetingKeys.detail(meetingId),
    disagreements: (meetingId: string) => meetingKeys.disagreements(meetingId),
    consensus: (meetingId: string) => meetingKeys.consensus(meetingId),
    contextStats: (meetingId: string) => meetingKeys.contextStats(meetingId),
    closing: (meetingId: string) => closingKeys.detail(meetingId),
    turnList: (meetingId: string) => turnKeys.list(meetingId),
    turnDetail: (meetingId: string, operationId: string) =>
        turnKeys.detail(meetingId, operationId),
};

export function createLiveMeetingsRuntime(): MeetingsRuntime {
    return {
        scope: LIVE_RUNTIME_SCOPE,
        capabilities: ALL_MEETING_CAPABILITIES,
        reads: {
            listMeetings: () => meetingClient.list(),
            getMeeting: (meetingId, signal) => meetingClient.get(meetingId, { signal }),
            disagreements: (meetingId, signal) =>
                meetingClient.disagreements(meetingId, { signal }),
            consensus: (meetingId, signal) =>
                meetingClient.consensus(meetingId, { signal }),
            contextStats: (meetingId, signal) =>
                meetingClient.contextStats(meetingId, { signal }),
            closing: (meetingId, signal) =>
                closingClient.get(meetingId, { signal }),
        },
        turns: {
            list: (meetingId, signal) => turnClient.list(meetingId, 100, { signal }),
            get: (meetingId, operationId, signal) =>
                turnClient.get(meetingId, operationId, { signal }),
            observe: (meetingId, operationId, options) =>
                turnClient.observe(meetingId, operationId, options),
            submit: (meetingId, input) => turnClient.submit(meetingId, input),
            cancel: (meetingId, operationId, signal) =>
                turnClient.cancel(meetingId, operationId, { signal }),
        },
        commands: {
            sendMessage: (meetingId, content, signal) =>
                meetingClient.sendMessage(meetingId, content, { signal }),
            requestClosing: (meetingId, input) =>
                closingClient.request(meetingId, input),
            retryClosing: (meetingId, signal) =>
                closingClient.retry(meetingId, { signal }),
            abortClosing: (meetingId, signal) =>
                closingClient.abort(meetingId, { signal }),
        },
        keys: liveKeys,
        presentation: {
            label: LIVE_RUNTIME_SCOPE.label,
            homeHref: "/meetings",
            readOnlyNotice: "This meeting is read-only.",
            provenance: LIVE_RUNTIME_SCOPE.provenance,
        },
        slots: {
            documentPanel: LiveDocumentsPanel,
            summaryPanel: LiveSummaryPanel,
            participantAction: LiveParticipantAction,
        },
    };
}

export function LiveMeetingsRuntimeProvider({
    children,
}: {
    children: ReactNode;
}) {
    return (
        <RuntimeScopeProvider scope={LIVE_RUNTIME_SCOPE}>
            <MeetingsRuntimeProvider runtime={createLiveMeetingsRuntime()}>
                {children}
            </MeetingsRuntimeProvider>
        </RuntimeScopeProvider>
    );
}
