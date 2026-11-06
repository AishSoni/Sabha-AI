"use client";

import { StackListView } from "../presentation/stack-list";
import { useAnchorRef } from "@/features/demo-tutorial";
import { DemoKnowledgeGate } from "./demo-knowledge-gate";
import { useLocalStacks } from "./use-local-stacks";

export function DemoStackList() {
    return (
        <DemoKnowledgeGate>
            <Content />
        </DemoKnowledgeGate>
    );
}

function Content() {
    const stacks = useLocalStacks();
    const firstStackRef = useAnchorRef("knowledge.stack");

    return (
        <main id="main-content" className="mx-auto max-w-5xl px-4 py-8 text-ink" tabIndex={-1}>
            <div className="mb-4 rounded-control border border-warning/40 bg-warning-soft px-3 py-2 type-body text-warning">
                These stacks and documents live in this browser tab only.
                Deleting or resetting them does not change the recorded meeting,
                its Files view, or its citations.
            </div>
            <StackListView
                stacks={stacks.stacks}
                isLoading={stacks.isLoading}
                isError={stacks.isError}
                removePending={stacks.pending}
                removeError={stacks.error}
                hrefs={{
                    createStack: "/demo/knowledge-stacks/new",
                    stack: (id) => `/demo/knowledge-stacks/${id}`,
                }}
                onDelete={(stackId) => {
                    const stack = stacks.getStack(stackId);
                    if (!stack) return;
                    const confirmed = window.confirm(
                        `Delete "${stack.name}"? Its practice documents will be revoked first and assigned practice participants will lose access. The recorded meeting and its documents are unchanged.`
                    );
                    if (confirmed) stacks.deleteStack(stackId);
                }}
                firstLinkRef={firstStackRef}
            />
        </main>
    );
}
