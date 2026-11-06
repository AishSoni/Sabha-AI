import { describe, expect, it } from "vitest";

import { HOME_COPY } from "@/features/homepage/presentation/copy";
import {
  EMBLEMS,
  emblemById,
  emblemSvgMarkup,
} from "@/features/homepage/presentation/emblems";
import {
  HOME_FIELD_SLOTS,
  HOME_FIELD_SLOTS_BY_DENSITY,
  resolveFieldSlot,
} from "@/features/homepage/presentation/field-layout";
import {
  EVIDENCE_EDGES,
  EVIDENCE_NODE_BY_ID,
  EVIDENCE_NODES,
} from "@/features/homepage/presentation/evidence-graph";
import { createHomeStars } from "@/features/homepage/presentation/starfield";

describe("homepage copy", () => {
  it("keeps the approved static headline and destinations", () => {
    expect(HOME_COPY.title).toEqual({
      lead: "Bring more minds",
      tail: "to your next decision.",
    });
    expect(HOME_COPY.demoCta).toBe("Explore the recorded demo");
    expect(HOME_COPY.operatorCta).toBe("Operator sign-in");
    expect(HOME_COPY.disclosure).toBe(
      "Prepared demo · recorded responses, not live generation.",
    );
  });

  it("labels the evidence view as illustrative rather than live", () => {
    expect(HOME_COPY.evidence.illustrative).toContain("Illustrative");
    expect(HOME_COPY.evidence.illustrative).toContain(
      "not a live retrieval record",
    );
  });
});

describe("homepage emblem field", () => {
  it("has eight distinct authored emblems with self-contained SVG output", () => {
    const ids = EMBLEMS.map((emblem) => emblem.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(8);

    for (const id of ids) {
      const emblem = emblemById(id);
      expect(emblem.fill.length).toBeGreaterThan(0);
      const markup = emblemSvgMarkup(emblem);
      expect(markup).toContain("<svg");
      expect(markup).not.toMatch(/(href|src)=/);
      expect(markup).not.toContain("<image");
    }
  });

  it("uses the authored density budget without changing slot identity", () => {
    expect(HOME_FIELD_SLOTS).toHaveLength(18);
    expect(HOME_FIELD_SLOTS_BY_DENSITY.wide).toHaveLength(18);
    expect(HOME_FIELD_SLOTS_BY_DENSITY.medium).toHaveLength(14);
    expect(HOME_FIELD_SLOTS_BY_DENSITY.compact).toHaveLength(7);

    for (const slot of HOME_FIELD_SLOTS_BY_DENSITY.compact) {
      expect(slot.compact).toBe(true);
    }
    for (const slot of HOME_FIELD_SLOTS_BY_DENSITY.medium) {
      expect(slot.medium).toBe(true);
    }
  });

  it("resolves a deterministic tangent-aware position", () => {
    const slot = HOME_FIELD_SLOTS[0]!;
    const first = resolveFieldSlot(slot);
    const second = resolveFieldSlot(slot);

    expect(first).toEqual(second);
    expect(first.x).toBeGreaterThan(0);
    expect(first.y).toBeGreaterThan(0);
    expect(Number.isFinite(first.rotation)).toBe(true);
  });

  it("keeps static positions stable at fractional precision", () => {
    for (const slot of HOME_FIELD_SLOTS) {
      const position = resolveFieldSlot(slot);
      expect(position.x).toBe(Number(position.x.toFixed(3)));
      expect(position.y).toBe(Number(position.y.toFixed(3)));
      expect(position.rotation).toBe(Number(position.rotation.toFixed(3)));
    }
  });
});

describe("homepage starfield", () => {
  it("generates a deterministic sparse field", () => {
    const first = createHomeStars();
    const second = createHomeStars();

    expect(first).toHaveLength(72);
    expect(first).toEqual(second);
    expect(first.every((star) => star.x >= 0 && star.x <= 1600)).toBe(true);
    expect(first.every((star) => star.y >= 0 && star.y <= 1000)).toBe(true);
    expect(first.every((star) => star.radius > 0)).toBe(true);
  });
});

describe("homepage evidence graph", () => {
  it("contains the approved nine nodes", () => {
    expect(EVIDENCE_NODES).toHaveLength(9);
    expect(new Set(EVIDENCE_NODES.map((node) => node.id)).size).toBe(9);
    expect([...EVIDENCE_NODE_BY_ID.keys()]).toEqual(
      expect.arrayContaining([
        "credit-analyst",
        "downside-reviewer",
        "portfolio-analyst",
        "shared-fact-sheet",
        "credit-evidence",
        "downside-worksheet",
        "portfolio-mandate",
        "crisil-annexure",
        "hdfc-fy20-mda",
      ]),
    );
  });

  it("only connects known nodes and never invents file-to-file links", () => {
    for (const edge of EVIDENCE_EDGES) {
      const from = EVIDENCE_NODE_BY_ID.get(edge.from);
      const to = EVIDENCE_NODE_BY_ID.get(edge.to);
      expect(from, edge.id).toBeDefined();
      expect(to, edge.id).toBeDefined();
      expect(from?.kind === "document" && to?.kind === "document").toBe(false);
      expect(from?.id).not.toBe(to?.id);
    }
  });

  it("keeps assignments and citations distinct", () => {
    const assignments = EVIDENCE_EDGES.filter(
      (edge) => edge.kind === "assignment",
    );
    const citations = EVIDENCE_EDGES.filter(
      (edge) => edge.kind === "citation",
    );

    expect(assignments).toHaveLength(6);
    expect(citations).toHaveLength(7);

    for (const edge of assignments) {
      expect(edge.note).toMatch(/available/i);
    }
    for (const edge of citations) {
      expect(edge.note).toMatch(/prepared|support/i);
    }
  });

  it("omits the source register and unsupported document provenance", () => {
    expect(EVIDENCE_NODE_BY_ID.has("source-register")).toBe(false);
    const serialized = JSON.stringify(EVIDENCE_NODES);
    expect(serialized).not.toMatch(/sha256|retrieval score|source-register/i);
  });
});
