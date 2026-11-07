"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { DemoNav, DemoWorkspaceProvider } from "@/features/demo-workspace";
import { isRoomPath } from "@/features/demo-tutorial";
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
    const pathname = usePathname();
    const room = isRoomPath(pathname);
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
                    <DemoNav hideChrome={room}>
                        <TutorialBoundary>
                            <TutorialHud />
                            <TutorialNotices />
                            {/*
                             * The chapter entry remounts the route page when a
                             * chapter changes. Keeping it inside the tutorial
                             * provider means a hidden HUD survives chapter
                             * inspection instead of restarting the visitor's
                             * presentation state.
                             *
                             * Ordinary routes use document scrolling. The room
                             * owns the dynamic viewport and must not create a
                             * second page scrollbar.
                             */}
                            <div className={room ? "h-dvh min-h-0" : undefined}>
                                <ChapterBootstrap>{children}</ChapterBootstrap>
                            </div>
                        </TutorialBoundary>
                    </DemoNav>
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
