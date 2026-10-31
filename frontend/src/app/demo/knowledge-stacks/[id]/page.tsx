"use client";

import { use } from "react";
import { DemoKnowledgeStackRoute } from "./stack-route";

export default function DemoKnowledgeStackPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = use(params);
    return <DemoKnowledgeStackRoute stackId={id} />;
}
