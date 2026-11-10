"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Starfield } from "@/components/atmosphere";
import { DemoNav, DemoWorkspaceProvider } from "@/features/demo-workspace";
import {
    DemoEntryGate,
    DemoIntroProvider,
    useDemoIntro,
} from "@/features/demo-intro";
import { isRoomPath } from "@/features/demo-tutorial";
import { DemoTutorialProvider } from "@/features/demo-tutorial/provider";
import { TutorialBoundary } from "@/features/demo-tutorial/error-boundary";
import { TutorialHud } from "@/features/demo-tutorial/hud";
import { TutorialNotices } from "@/features/demo-tutorial/notices";
import {
    ReplaySessionProvider,
    useReplaySession,
    useReplaySessionReady,
} from "@/features/meetings/runtime/replay-session";
import { ReplayRunProvider } from "@/features/meetings/runtime/replay-run";
import { ChapterBootstrap } from "./chapter-bootstrap";

function PinnedWorkspace({ children }: { children: ReactNode }) {
    const pathname = usePathname();
    const room = isRoomPath(pathname);
    const intro = useDemoIntro();
    const { session } = useReplaySessionReady();
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
                        {room ? <DemoNav /> : null}
                        <TutorialBoundary>
                            {intro.open ? null : (
                                <>
                                    <TutorialHud />
                                    <TutorialNotices />
                                </>
                            )}
                        </TutorialBoundary>
                        <div className="relative z-10 min-h-0 flex-1 overflow-y-auto">
                            {room ? null : (
                                <div className="sticky top-0 z-chrome">
                                    <DemoNav />
                                </div>
                            )}
                            <ChapterBootstrap>{children}</ChapterBootstrap>
                        </div>
                    </div>
                </DemoTutorialProvider>
            </ReplayRunProvider>
        </DemoWorkspaceProvider>
    );
}

function DemoShellContent({ children }: { children: ReactNode }) {
    const readiness = useReplaySession();
    return (
        <DemoIntroProvider>
            <DemoEntryGate readiness={readiness}>
                <PinnedWorkspace>{children}</PinnedWorkspace>
            </DemoEntryGate>
        </DemoIntroProvider>
    );
}

export function DemoShell({ children }: { children: ReactNode }) {
    return (
        <ReplaySessionProvider>
            <DemoShellContent>{children}</DemoShellContent>
        </ReplaySessionProvider>
    );
}
