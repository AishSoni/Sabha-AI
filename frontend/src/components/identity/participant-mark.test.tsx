import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DYNAMITE_MARKS, dynamiteMarkFor } from "./dynamite-marks";
import { DirectorMark, ParticipantMark } from "./participant-mark";

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
          name: "The Credit Analyst",
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

  it("keeps marks legible at every container and glyph size", () => {
    const sizes = [
      ["sm", "h-8 w-8", "h-[22px] w-[22px]"],
      ["md", "h-9 w-9", "h-6 w-6"],
      ["lg", "h-11 w-11", "h-[30px] w-[30px]"],
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
