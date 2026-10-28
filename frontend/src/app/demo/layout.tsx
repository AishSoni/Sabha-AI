import type { ReactNode } from "react";
import { GuidedReplay } from "@/features/meetings/guide/GuidedReplay";
import { ReplayRunProvider } from "@/features/meetings/runtime/replay-run";

export default function DemoLayout({ children }: { children: ReactNode }) {
    return (
        <ReplayRunProvider>
            <GuidedReplay>{children}</GuidedReplay>
        </ReplayRunProvider>
    );
}
