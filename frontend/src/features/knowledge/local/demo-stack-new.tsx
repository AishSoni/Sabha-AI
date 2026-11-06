"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { StackEditorView } from "../presentation/stack-editor";
import { DemoKnowledgeGate } from "./demo-knowledge-gate";
import { useLocalStacks } from "./use-local-stacks";

export function DemoStackNew() {
    return (
        <DemoKnowledgeGate>
            <Content />
        </DemoKnowledgeGate>
    );
}

function Content() {
    const router = useRouter();
    const stacks = useLocalStacks();

    return (
        <main id="main-content" className="mx-auto max-w-3xl space-y-4 px-4 py-8 text-ink" tabIndex={-1}>
            <Link
                href="/demo/knowledge-stacks"
                className="m-control inline-flex type-body text-action hover:underline"
            >
                ← Back to practice stacks
            </Link>
            <div>
                <h1 className="type-page-title">New practice stack</h1>
                <p className="mt-1 type-body text-ink-secondary">
                    A temporary document collection for this browser tab. It
                    never creates an operator stack or assigns a recorded
                    participant.
                </p>
            </div>
            <StackEditorView
                editing={false}
                initialName=""
                initialDescription=""
                error={stacks.error}
                description="Stack contents stay current for practice participants assigned to this stack. Template defaults apply to new snapshots and do not rewrite saved assignments."
                onSubmit={async (input) => {
                    const result = await stacks.createStack(input);
                    if (!result.ok) throw new Error(result.error);
                    router.push(`/demo/knowledge-stacks/${result.stackId}`);
                }}
            />
        </main>
    );
}
