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
import {
  SPIRAL_CARD_COUNT,
  cardSceneAt,
  sampleSpiral,
} from "@/features/homepage/presentation/spiral";
import { createHomeStars } from "@/features/homepage/presentation/starfield";

describe("homepage copy", () => {
  it("keeps the approved static headline and destinations", () => {
    expect(HOME_COPY.title).toEqual({
      lead: "Bring more minds",
      tail: "to your next decision.",
    });
    expect(HOME_COPY.demoCta).toBe("Explore the recorded demo");
    expect(HOME_COPY.operatorCta).toBe("Operator sign-in");
    expect(HOME_COPY.evidence.disclosure).toBe(
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
  it("has eighteen distinct authored persona sigils", () => {
    const ids = EMBLEMS.map((emblem) => emblem.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(18);

    for (const id of ids) {
      const emblem = emblemById(id);
      expect(emblem.parts.length).toBeGreaterThan(0);
      const markup = emblemSvgMarkup(emblem);
      expect(markup).toContain("<svg");
      expect(markup).not.toMatch(/(href|src)=/);
      expect(markup).not.toContain("<image");
    }
  });

  it("uses the one-for-one spiral density at every breakpoint", () => {
    expect(SPIRAL_CARD_COUNT).toBe(189);
    expect(HOME_FIELD_SLOTS).toHaveLength(SPIRAL_CARD_COUNT);
    expect(HOME_FIELD_SLOTS_BY_DENSITY.wide).toHaveLength(SPIRAL_CARD_COUNT);
    expect(HOME_FIELD_SLOTS_BY_DENSITY.medium).toHaveLength(SPIRAL_CARD_COUNT);
    expect(HOME_FIELD_SLOTS_BY_DENSITY.compact).toHaveLength(SPIRAL_CARD_COUNT);
  });

  it("samples the spiral deterministically with tangent-aware cards", () => {
    const first = sampleSpiral(12.5);
    const second = sampleSpiral(12.5);
    expect(first).toEqual(second);
    expect(Number.isFinite(first.x)).toBe(true);
    expect(Number.isFinite(first.y)).toBe(true);
    expect(Number.isFinite(first.tx)).toBe(true);
    expect(Number.isFinite(first.ty)).toBe(true);

    const card = cardSceneAt(17, SPIRAL_CARD_COUNT, 0);
    expect(card).toEqual(cardSceneAt(17, SPIRAL_CARD_COUNT, 0));
    expect(Number.isFinite(card.angle)).toBe(true);
    expect(card.fade).toBeGreaterThanOrEqual(0);
    expect(card.scale).toBeGreaterThan(0);
  });

  it("keeps every authored slot finite and positioned by the spiral", () => {
    for (const slot of HOME_FIELD_SLOTS) {
      expect(Number.isFinite(slot.x)).toBe(true);
      expect(Number.isFinite(slot.y)).toBe(true);
      expect(Number.isFinite(slot.width)).toBe(true);
      expect(Number.isFinite(slot.height)).toBe(true);
      expect(slot.width).toBeGreaterThan(0);
      expect(slot.height).toBeGreaterThan(0);
      expect(slot.opacity).toBeGreaterThanOrEqual(0);
      expect(slot.opacity).toBeLessThanOrEqual(1);
      expect(resolveFieldSlot(slot)).toEqual({
        x: slot.x,
        y: slot.y,
        rotation: slot.rotation,
      });
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
