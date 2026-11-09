export type EvidenceNodeKind = "persona" | "document";
export type EvidenceScope = "shared" | "private" | "source";
export type EvidenceEdgeKind = "assignment" | "citation";

export interface EvidenceNode {
  readonly id: string;
  readonly name: string;
  readonly kind: EvidenceNodeKind;
  readonly scope?: EvidenceScope;
  readonly kindLabel: string;
  readonly description: string;
  readonly x: number;
  readonly y: number;
  readonly color?: string;
}

export interface EvidenceEdge {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly kind: EvidenceEdgeKind;
  readonly note: string;
  readonly curve?: number;
}

export const EVIDENCE_NODES: readonly EvidenceNode[] = [
  {
    id: "credit-analyst",
    name: "Mira",
    kind: "persona",
    kindLabel: "AI role in the example",
    description:
      "Tests the issuer record, covenant context, and evidence quality before the board relies on a fact.",
    x: 170,
    y: 120,
    color: "#6366f1",
  },
  {
    id: "downside-reviewer",
    name: "Arjun",
    kind: "persona",
    kindLabel: "AI role in the example",
    description:
      "Presents the strongest failure case and labels authored scenario material as authored.",
    x: 170,
    y: 300,
    color: "#f59e0b",
  },
  {
    id: "portfolio-analyst",
    name: "Leena",
    kind: "persona",
    kindLabel: "AI role in the example",
    description:
      "Checks the instrument against the fictional mandate and keeps residual uncertainty visible.",
    x: 170,
    y: 480,
    color: "#10b981",
  },
  {
    id: "shared-fact-sheet",
    name: "Shared fact sheet",
    kind: "document",
    scope: "shared",
    kindLabel: "Shared document",
    description:
      "Historical terms, rating, and stated limits for the HDFC debenture. Shared reference material.",
    x: 500,
    y: 300,
  },
  {
    id: "credit-evidence",
    name: "Credit evidence",
    kind: "document",
    scope: "private",
    kindLabel: "Private working set",
    description:
      "Private credit working notes. Only Mira is assigned to this knowledge stack.",
    x: 830,
    y: 80,
  },
  {
    id: "downside-worksheet",
    name: "Downside worksheet",
    kind: "document",
    scope: "private",
    kindLabel: "Private working set",
    description:
      "Authored downside worksheet. Fails once on purpose so the retry path can be practised safely.",
    x: 830,
    y: 220,
  },
  {
    id: "portfolio-mandate",
    name: "Portfolio mandate",
    kind: "document",
    scope: "private",
    kindLabel: "Private working set",
    description:
      "Fictional portfolio mandate for Leena's knowledge stack, with explicit record limits.",
    x: 830,
    y: 360,
  },
  {
    id: "crisil-annexure",
    name: "Crisil annexure",
    kind: "document",
    scope: "source",
    kindLabel: "Cited source",
    description:
      "Short attributed transcription of the CRISIL rating rationale dated 31 July 2020.",
    x: 500,
    y: 70,
  },
  {
    id: "hdfc-fy20-mda",
    name: "HDFC FY20 MD&A",
    kind: "document",
    scope: "source",
    kindLabel: "Cited source",
    description:
      "Short attributed transcription of the HDFC Ltd 2019-20 annual report MD&A.",
    x: 500,
    y: 530,
  },
];

export const EVIDENCE_EDGES: readonly EvidenceEdge[] = [
  {
    id: "credit-shared-assignment",
    from: "credit-analyst",
    to: "shared-fact-sheet",
    kind: "assignment",
    note: "Available through the shared meeting stack.",
    curve: -14,
  },
  {
    id: "downside-shared-assignment",
    from: "downside-reviewer",
    to: "shared-fact-sheet",
    kind: "assignment",
    note: "Available through the shared meeting stack.",
    curve: -14,
  },
  {
    id: "portfolio-shared-assignment",
    from: "portfolio-analyst",
    to: "shared-fact-sheet",
    kind: "assignment",
    note: "Available through the shared meeting stack.",
    curve: -14,
  },
  {
    id: "credit-evidence-assignment",
    from: "credit-analyst",
    to: "credit-evidence",
    kind: "assignment",
    note: "Available through Mira's private stack.",
  },
  {
    id: "downside-worksheet-assignment",
    from: "downside-reviewer",
    to: "downside-worksheet",
    kind: "assignment",
    note: "Available through Arjun's private stack.",
    curve: -10,
  },
  {
    id: "portfolio-mandate-assignment",
    from: "portfolio-analyst",
    to: "portfolio-mandate",
    kind: "assignment",
    note: "Available through Leena's private stack.",
  },
  {
    id: "credit-shared-citation",
    from: "credit-analyst",
    to: "shared-fact-sheet",
    kind: "citation",
    note: "C10 in the recorded Credit Analyst response.",
    curve: 14,
  },
  {
    id: "downside-shared-citation",
    from: "downside-reviewer",
    to: "shared-fact-sheet",
    kind: "citation",
    note: "C10 in the recorded Downside Reviewer response.",
    curve: 14,
  },
  {
    id: "portfolio-shared-citation",
    from: "portfolio-analyst",
    to: "shared-fact-sheet",
    kind: "citation",
    note: "C10, C11, and C13 support the recorded Portfolio Analyst response.",
    curve: 14,
  },
  {
    id: "credit-crisil-citation",
    from: "credit-analyst",
    to: "crisil-annexure",
    kind: "citation",
    note: "C1, C2, and C12 support the recorded Credit Analyst response.",
  },
  {
    id: "credit-mda-citation",
    from: "credit-analyst",
    to: "hdfc-fy20-mda",
    kind: "citation",
    note: "C3 supports the recorded Credit Analyst response.",
  },
  {
    id: "downside-mda-citation",
    from: "downside-reviewer",
    to: "hdfc-fy20-mda",
    kind: "citation",
    note: "C6 supports the recorded Downside Reviewer response.",
  },
  {
    id: "downside-worksheet-citation",
    from: "downside-reviewer",
    to: "downside-worksheet",
    kind: "citation",
    note: "C7, C8, and C9 support the recorded Downside Reviewer response.",
    curve: 10,
  },
];

export const EVIDENCE_NODE_BY_ID = new Map(
  EVIDENCE_NODES.map((node) => [node.id, node]),
);

export function evidenceEdgesFor(nodeId: string): readonly EvidenceEdge[] {
  return EVIDENCE_EDGES.filter(
    (edge) => edge.from === nodeId || edge.to === nodeId,
  );
}

export function evidenceNodeName(nodeId: string): string {
  return EVIDENCE_NODE_BY_ID.get(nodeId)?.name ?? nodeId;
}

export function edgeKindLabel(kind: EvidenceEdgeKind): string {
  return kind === "assignment" ? "Assigned / available" : "Example citation";
}
