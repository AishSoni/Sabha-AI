"use client";

import type { ReactNode } from "react";
import { DemoWorkspaceProvider } from "@/features/demo-workspace";
import {
    ReplaySessionProvider,
    useReplaySession,
} from "@/features/meetings/runtime/replay-session";
import { GuidedReplay } from "@/features/meetings/guide/GuidedReplay";
import { ReplayRunProvider } from "@/features/meetings/runtime/replay-run";

function PinnedWorkspace({ children }: { children: ReactNode }) {
    const { session } = useReplaySession();
    const identity = {
        packageId: session.package_id,
        version: session.package_version,
        contentSha256: session.content_sha256,
        meetingId: session.meeting_id,
    };
    return (
        <DemoWorkspaceProvider identity={identity}>
            <ReplayRunProvider>
                <GuidedReplay>{children}</GuidedReplay>
            </ReplayRunProvider>
        </DemoWorkspaceProvider>
    );
}

export function DemoShell({ children }: { children: ReactNode }) {
    return (
        <ReplaySessionProvider>
            <PinnedWorkspace>{children}</PinnedWorkspace>
        </ReplaySessionProvider>
    );
}
