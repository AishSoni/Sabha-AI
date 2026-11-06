"use client";

import type { ReactNode } from "react";
import { Starfield } from "@/components/atmosphere";
import { DemoNav, DemoWorkspaceProvider } from "@/features/demo-workspace";
import { DemoTutorialProvider } from "@/features/demo-tutorial/provider";
import { TutorialBoundary } from "@/features/demo-tutorial/error-boundary";
import { TutorialHud } from "@/features/demo-tutorial/hud";
import { TutorialNotices } from "@/features/demo-tutorial/notices";
import { TutorialRail } from "@/features/demo-tutorial/rail";
import {
    ReplaySessionProvider,
    useReplaySession,
} from "@/features/meetings/runtime/replay-session";
import { ReplayRunProvider } from "@/features/meetings/runtime/replay-run";
import { ChapterBootstrap } from "./chapter-bootstrap";

function PinnedWorkspace({ children }: { children: ReactNode }) {
    const { session } = useReplaySession();
    const identity = {
        packageId: session.package_id,
        version: session.package_version,
        contentSha256: session.content_sha256,
        meetingId: session.meeting_id,
    };
    return (
        <DemoWorkspaceProvider
            identity={identity}
            publishedAssets={session.assets.map((asset) => ({
                assetId: asset.asset_id,
                publicUrl: asset.public_url,
                mediaType: asset.media_type,
                sha256: asset.sha256,
                sizeBytes: asset.size,
            }))}
        >
            <ReplayRunProvider>
                <DemoTutorialProvider>
                    <div className="relative isolate flex h-dvh min-h-0 flex-col">
                        <Starfield />
                        <DemoNav />
                        <TutorialBoundary>
                            <TutorialRail />
                            <TutorialHud />
                            <TutorialNotices />
                        </TutorialBoundary>
                        {/*
                         * The chapter entry remounts the route page when a
                         * chapter changes. Keeping it inside the tutorial
                         * provider means a hidden HUD survives chapter
                         * inspection instead of restarting the visitor's
                         * presentation state.
                         *
                         * This is the single viewport owner for demo routes:
                         * ordinary pages scroll here, while the room fills the
                         * same space without creating a second page scrollbar.
                         */}
                        <div className="relative z-10 min-h-0 flex-1 overflow-y-auto">
                            <ChapterBootstrap>{children}</ChapterBootstrap>
                        </div>
                    </div>
                </DemoTutorialProvider>
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
