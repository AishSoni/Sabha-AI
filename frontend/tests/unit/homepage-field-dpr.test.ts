import { describe, expect, it } from "vitest";

import { fieldDprCap } from "@/features/homepage/presentation/field-layout";

describe("homepage field device pixel cap", () => {
  it("caps compact viewports below the wide breakpoint", () => {
    expect(fieldDprCap(320)).toBe(1.5);
    expect(fieldDprCap(390)).toBe(1.5);
    expect(fieldDprCap(767)).toBe(1.5);
  });

  it("allows the higher cap from the wide breakpoint onwards", () => {
    expect(fieldDprCap(768)).toBe(2);
    expect(fieldDprCap(1024)).toBe(2);
    expect(fieldDprCap(1440)).toBe(2);
  });
});
