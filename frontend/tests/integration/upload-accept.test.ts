/**
 * Contract: upload inputs must advertise only formats the backend really
 * ingests. Legacy BIFF .xls is rejected at upload validation, so UI selectors
 * must not list it as acceptable.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const UPLOAD_PAGES = [
  "src/features/knowledge/components/DocumentPanel.tsx",
  "src/app/meetings/new/page.tsx",
];

function acceptTokens(source: string): string[] {
  const match = source.match(/accept="([^"]*)"/);
  if (!match) return [];
  return match[1].split(",").map((token) => token.trim().toLowerCase());
}

describe("upload selectors only advertise supported formats", () => {
  it.each(UPLOAD_PAGES)("%s accepts xlsx but never legacy xls", (relativePath) => {
    const source = readFileSync(resolve(process.cwd(), relativePath), "utf8");
    const tokens = acceptTokens(source);
    expect(tokens.length, `${relativePath} must declare an accept attribute`).toBeGreaterThan(0);
    expect(tokens).toContain(".xlsx");
    expect(
      tokens,
      `${relativePath} still advertises the unsupported legacy .xls format`,
    ).not.toContain(".xls");
  });
});
