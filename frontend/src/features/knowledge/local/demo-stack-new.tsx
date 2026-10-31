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
        <main className="mx-auto max-w-3xl space-y-4 px-4 py-8">
            <Link
                href="/demo/knowledge-stacks"
                className="text-sm text-cyan-400 hover:text-cyan-300"
            >
                ← Back to practice stacks
            </Link>
            <div>
                <h1 className="text-xl font-bold text-white">
                    New practice stack
                </h1>
                <p className="mt-1 text-sm text-zinc-400">
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
