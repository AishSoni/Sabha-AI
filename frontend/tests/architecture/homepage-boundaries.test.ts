/**
 * Homepage isolation boundaries (spec-32).
 *
 * The public landing page is a presentation surface: it must not reach into
 * access, replay, persistence, provider, or live API modules. Its presentation
 * data stays pure so the static shell cannot accidentally become a client
 * application or a second source of graph truth.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const FRONTEND_ROOT = path.resolve(__dirname, "../..");
const HOMEPAGE_ROOT = path.join(FRONTEND_ROOT, "src/features/homepage");
const ROUTE = path.join(FRONTEND_ROOT, "src/app/page.tsx");

function filesUnder(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? filesUnder(full) : [full];
  });
}

const homepageFiles = filesUnder(HOMEPAGE_ROOT);
const presentationFiles = homepageFiles.filter((file) =>
  file.includes(`${path.sep}presentation${path.sep}`),
);

function source(file: string): string {
  return fs.readFileSync(file, "utf8");
}

describe("homepage isolation", () => {
  it("keeps the route a thin homepage composition", () => {
    const route = source(ROUTE);
    expect(route).toMatch(/@\/features\/homepage/);
    expect(route).not.toMatch(/@\/features\/(access|demo-workspace|knowledge|meetings|settings)/);
    expect(route).not.toMatch(/@supabase|@tanstack|fetch\(|localStorage|sessionStorage/);
  });

  it("composes exactly the four approved page regions", () => {
    const page = source(path.join(HOMEPAGE_ROOT, "ui/home-page.tsx"));
    for (const region of ["HomeHeader", "HomeHero", "HomeEvidence", "HomeFooter"]) {
      expect(page).toContain(`<${region}`);
    }
    expect(page.match(/<main\b/g)).toHaveLength(1);
    expect(page).toMatch(/id="main-content"/);
  });

  it("does not reach live data, access, or persistence from the page feature", () => {
    for (const file of homepageFiles) {
      const content = source(file);
      expect(content, file).not.toMatch(
        /@supabase|@tanstack\/react-query|from ["']zustand|localStorage|sessionStorage|document\.cookie|indexedDB/,
      );
      expect(content, file).not.toMatch(
        /from ["']@\/features\/(access|demo-workspace|knowledge|meetings|settings)/,
      );
      expect(content, file).not.toMatch(/fetch\(/);
    }
  });

  it("keeps presentation data pure and local", () => {
    for (const file of presentationFiles) {
      const content = source(file);
      expect(content, file).not.toMatch(/from ["']react["']/);
      expect(content, file).not.toMatch(/from ["']next\//);
      expect(content, file).not.toMatch(/from ["']@\//);
      const imports = content.match(/from ["']([^"']+)["']/g) ?? [];
      for (const specifier of imports) {
        expect(specifier, file).toMatch(/from ["']\.\//);
      }
    }
  });

  it("keeps the public appearance control in the homepage header", () => {
    const header = source(path.join(HOMEPAGE_ROOT, "ui/home-header.tsx"));
    expect(header).toMatch(/<AppearanceMenu\b/);
    expect(header).toMatch(/Pause animation|Resume animation/);
  });
});
