"use client";

import { useState } from "react";
import { RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useDemoWorkspace } from "../provider";

/**
 * Room-level access to the demo reset. The global chrome collapses inside a
 * meeting, so the destructive workspace action needs an explicit local home.
 */
export function DemoRoomReset() {
    const workspace = useDemoWorkspace();
    const [confirming, setConfirming] = useState(false);

    const reset = () => {
        workspace.resetWorkspace();
        setConfirming(false);
    };

    return (
        <>
            <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-ink-secondary"
                onClick={() => {
                    if (workspace.hasPracticeEdits) {
                        setConfirming(true);
                        return;
                    }
                    reset();
                }}
            >
                <RotateCcw aria-hidden="true" />
                Reset demo
            </Button>
            <AlertDialog open={confirming} onOpenChange={setConfirming}>
                <AlertDialogContent aria-label="Reset demo workspace">
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            Reset the demo workspace?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            Practice edits will be lost and the recording will
                            return to its first step.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Keep editing</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-danger text-on-danger hover:bg-danger-hover"
                            onClick={reset}
                        >
                            Reset and discard edits
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
