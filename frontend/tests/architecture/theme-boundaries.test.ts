import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const src = path.join(process.cwd(), "src");
const appearanceDir = path.join(src, "components", "appearance");

function filesUnder(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(entryPath) : [entryPath];
  });
}

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
}

const appearanceSources = filesUnder(appearanceDir)
  .filter((file) => /\.(ts|tsx)$/.test(file) && !/\.test\./.test(file))
  .map((file) => ({
    file: path.relative(src, file).replaceAll("\\", "/"),
    source: stripComments(fs.readFileSync(file, "utf8")),
  }));

const layout = fs.readFileSync(path.join(src, "app", "layout.tsx"), "utf8");
const globals = fs.readFileSync(path.join(src, "app", "globals.css"), "utf8");
const styleSources = filesUnder(path.join(src, "styles"))
  .filter((file) => file.endsWith(".css"))
  .map((file) => fs.readFileSync(file, "utf8"))
  .join("\n");

describe("appearance boundary", () => {
  it("does not load a font from Google or force the dark class", () => {
    expect(layout).not.toMatch(/next\/font\/google/);
    expect(layout).not.toMatch(/\bInter\b/);
    expect(layout).not.toMatch(/className=["']dark["']/);
    expect(layout).not.toMatch(/data-theme=["']dark["']/);
    expect(layout).toMatch(/AppearanceProvider/);
  });

  it("mounts the appearance menu in the public, operator, and demo chrome", () => {
    const chrome = [
      path.join(src, "app", "page.tsx"),
      path.join(src, "features", "access", "ui", "operator-shell.tsx"),
      path.join(src, "features", "demo-workspace", "ui", "demo-nav.tsx"),
    ];
    for (const file of chrome) {
      expect(fs.readFileSync(file, "utf8")).toMatch(/<AppearanceMenu\b/);
    }
  });

  it("does not ship the transition-all or legacy animation layer", () => {
    expect(styleSources).not.toMatch(/transition:\s*all/);
    expect(globals).not.toMatch(/tw-animate-css/);
    expect(globals).not.toMatch(/@custom-variant\s+dark/);
  });

  it("uses Satoshi as the single sans source", () => {
    expect(globals).toMatch(/--font-sans:\s*var\(--font-satoshi\)/);
    expect(globals).not.toMatch(/--font-geist/);
    expect(styleSources).not.toMatch(/@import\s+url\(/);
    expect(styleSources).not.toMatch(/fonts\.googleapis|fonts\.gstatic/);
  });

  it("keeps appearance state out of storage, Auth, and data queries", () => {
    const forbidden = [
      /localStorage/,
      /sessionStorage/,
      /document\.cookie/,
      /indexedDB/,
      /\bfetch\s*\(/,
      /@supabase/,
      /@tanstack\/react-query/,
      /\bzustand\b/,
      /@\/features/,
      /@\/stores/,
      /@\/shared\/access/,
    ];

    for (const { file, source } of appearanceSources) {
      for (const pattern of forbidden) {
        expect(source, `${file} must not match ${pattern}`).not.toMatch(
          pattern,
        );
      }
    }
  });
});
