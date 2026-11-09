import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DYNAMITE_MARKS, dynamiteMarkFor } from "./dynamite-marks";
import {
  DirectorMark,
  ParticipantMark,
  participantMarkId,
} from "./participant-mark";

describe("dddynamite participant identity", () => {
  it("keeps a curated, distinct star/spark family", () => {
    expect(DYNAMITE_MARKS).toHaveLength(10);
    expect(new Set(DYNAMITE_MARKS.map((mark) => mark.name)).size).toBe(10);
    expect(new Set(DYNAMITE_MARKS.map((mark) => mark.path)).size).toBe(10);
    for (const mark of DYNAMITE_MARKS) {
      expect(mark.path).toMatch(/^[Mm]/);
    }
  });

  it("assigns the same mark to the same immutable id", () => {
    expect(dynamiteMarkFor("credit-analyst")).toBe(
      dynamiteMarkFor("credit-analyst"),
    );
    const demoMarks = new Set(
      [
        "credit-analyst",
        "downside-reviewer",
        "portfolio-analyst",
        "sabha-director",
      ].map((id) => dynamiteMarkFor(id).name),
    );
    expect(demoMarks.size).toBe(4);
  });

  it("renders a silhouette, not an initial or a role claim", () => {
    const { container } = render(
      <ParticipantMark
        participant={{
          id: "credit-analyst",
          name: "Mira",
          color: "#6366f1",
        }}
      />,
    );
    const mark = container.querySelector("[data-participant-mark]");
    expect(mark).not.toBeNull();
    expect(mark?.querySelector("svg path")).not.toBeNull();
    expect(mark?.textContent).toBe("");
    expect(mark?.getAttribute("aria-hidden")).toBe("true");
  });

  it("prefers an explicit demo mark, then the originating persona, then the participant id", () => {
    expect(
      participantMarkId({
        id: "participant-1",
        persona_id: "persona-1",
        markId: "recorded-participant-1",
      }),
    ).toBe("recorded-participant-1");
    expect(
      participantMarkId({ id: "participant-1", persona_id: "persona-1" }),
    ).toBe("persona-1");
    expect(
      participantMarkId({ id: "participant-1", persona_id: null }),
    ).toBe("participant-1");
  });

  it("keeps the originating persona mark across fresh participant rows", () => {
    const first = render(
      <ParticipantMark
        participant={{
          id: "participant-1",
          persona_id: "persona-1",
          name: "Mira",
          color: "#6366f1",
        }}
      />,
    );
    const second = render(
      <ParticipantMark
        participant={{
          id: "participant-2",
          persona_id: "persona-1",
          name: "Mira",
          color: "#6366f1",
        }}
      />,
    );

    expect(
      first.container
        .querySelector("[data-participant-mark]")
        ?.getAttribute("data-participant-mark"),
    ).toBe(
      second.container
        .querySelector("[data-participant-mark]")
        ?.getAttribute("data-participant-mark"),
    );
  });

  it("falls back to the participant id for non-persona participants", () => {
    const first = render(
      <ParticipantMark
        participant={{ id: "participant-1", name: "Guest", color: "#71717a" }}
      />,
    );
    const second = render(
      <ParticipantMark
        participant={{ id: "participant-2", name: "Guest", color: "#71717a" }}
      />,
    );

    expect(
      first.container
        .querySelector("[data-participant-mark]")
        ?.getAttribute("data-participant-mark"),
    ).not.toBe(
      second.container
        .querySelector("[data-participant-mark]")
        ?.getAttribute("data-participant-mark"),
    );
  });

  it("keeps the mark stable when the participant is renamed or recoloured", () => {
    const first = render(
      <ParticipantMark
        participant={{
          id: "participant-1",
          persona_id: "persona-1",
          name: "Mira",
          color: "#6366f1",
        }}
      />,
    );
    const second = render(
      <ParticipantMark
        participant={{
          id: "participant-1",
          persona_id: "persona-1",
          name: "Mira Rao",
          color: "#f59e0b",
        }}
      />,
    );

    expect(
      first.container
        .querySelector("[data-participant-mark]")
        ?.getAttribute("data-participant-mark"),
    ).toBe(
      second.container
        .querySelector("[data-participant-mark]")
        ?.getAttribute("data-participant-mark"),
    );
  });

  it("keeps marks legible at every container and glyph size", () => {
    const sizes = [
      ["sm", "h-9 w-9", "h-7 w-7"],
      ["md", "h-10 w-10", "h-8 w-8"],
      ["lg", "h-12 w-12", "h-9 w-9"],
    ] as const;

    for (const [size, containerClass, glyphClass] of sizes) {
      const { container, unmount } = render(<DirectorMark size={size} />);
      const mark = container.querySelector("[data-participant-mark]");
      expect(mark?.className).toContain(containerClass);
      expect(mark?.querySelector("svg")?.getAttribute("class")).toContain(
        glyphClass,
      );
      unmount();
    }
  });

  it("gives the director the same family without a letter avatar", () => {
    const { container } = render(<DirectorMark />);
    const mark = container.querySelector("[data-participant-mark]");
    expect(mark?.querySelector("svg path")).not.toBeNull();
    expect(mark?.textContent).toBe("");
  });
});
