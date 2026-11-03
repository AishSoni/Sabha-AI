"use client";

import type { ReactNode } from "react";
import { DemoNav, DemoWorkspaceProvider } from "@/features/demo-workspace";
import { DemoTutorialProvider } from "@/features/demo-tutorial/provider";
import { TutorialBoundary } from "@/features/demo-tutorial/error-boundary";
import { TutorialHud } from "@/features/demo-tutorial/hud";
import { TutorialNotices } from "@/features/demo-tutorial/notices";
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
                <ChapterBootstrap>
                    <DemoTutorialProvider>
                        <DemoNav />
                        <TutorialBoundary>
                            <TutorialHud />
                            <TutorialNotices />
                        </TutorialBoundary>
                        {children}
                    </DemoTutorialProvider>
                </ChapterBootstrap>
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
