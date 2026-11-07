"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PageContainer, PageHeader } from "@/components/shell";

export default function DemoError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error(error);
    }, [error]);

    return (
        <main id="main-content" tabIndex={-1}>
            <PageHeader
                title="This recorded view could not be loaded"
                description="The recording is still available. Retry this view or return to the board."
                backHref="/demo"
                backLabel="Back to the board"
            />
            <PageContainer>
                <div
                    role="alert"
                    className="material-raised flex max-w-2xl flex-col items-start gap-4 rounded-group border border-separator p-6"
                >
                    <div className="flex items-center gap-2 type-item-title text-ink">
                        <AlertTriangle
                            aria-hidden="true"
                            className="size-5 text-warning"
                        />
                        Something interrupted this recorded view
                    </div>
                    <p className="type-body text-ink-secondary">
                        No live request was made and the recording was not
                        changed. Retry the read, or return to the prepared
                        board.
                    </p>
                    <div className="flex flex-wrap gap-2">
                        <Button type="button" onClick={reset}>
                            <RotateCcw aria-hidden="true" />
                            Try again
                        </Button>
                        <Button asChild variant="outline">
                            <Link href="/demo">Back to the board</Link>
                        </Button>
                    </div>
                </div>
            </PageContainer>
        </main>
    );
}
