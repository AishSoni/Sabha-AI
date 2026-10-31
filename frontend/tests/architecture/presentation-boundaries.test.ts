/**
 * Shared presentation boundary (spec-23).
 *
 * Demo screens may import a feature's `presentation` entry only. That entry
 * must remain pure: no live API client, hook, transport, access, credential,
 * store, or settings module may be reachable from it.
 */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { resolveInternalSpec } from "./checker";

const FRONTEND_ROOT = path.resolve(__dirname, "../..");
const PRESENTATION_ENTRIES = [
    path.join(FRONTEND_ROOT, "src/features/persona-catalog/presentation.ts"),
    path.join(FRONTEND_ROOT, "src/features/knowledge/presentation.ts"),
];
const LIVE_COMPONENT = path.join(
    FRONTEND_ROOT,
    "src/features/knowledge/components/DocumentPanel.tsx"
);

const FORBIDDEN_PREFIXES = [
    "src/features/settings",
    "src/features/access",
    "src/shared/access",
    "src/shared/credentials",
    "src/stores",
    "src/lib/api",
    "src/shared/api/transport",
    "src/features/persona-catalog/api",
    "src/features/persona-catalog/index.ts",
    "src/features/persona-catalog/ui",
    "src/features/knowledge/api",
    "src/features/knowledge/hooks",
    "src/features/knowledge/components",
    "src/features/knowledge/index.ts",
];

function moduleSpecifiers(file: string): string[] {
    const source = fs.readFileSync(file, "utf8");
    const parsed = ts.createSourceFile(
        file,
        source,
        ts.ScriptTarget.Latest,
        true,
        file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    );
    const specs: string[] = [];
    const visit = (node: ts.Node) => {
        if (ts.isImportDeclaration(node)) {
            if (ts.isStringLiteral(node.moduleSpecifier)) {
                specs.push(node.moduleSpecifier.text);
            }
        } else if (
            ts.isExportDeclaration(node) &&
            node.moduleSpecifier &&
            ts.isStringLiteral(node.moduleSpecifier)
        ) {
            specs.push(node.moduleSpecifier.text);
        }
        ts.forEachChild(node, visit);
    };
    visit(parsed);
    return specs;
}

function graphFrom(entries: string[]): string[] {
    const seen = new Set<string>();
    const queue = [...entries];
    const modules: string[] = [];
    while (queue.length > 0) {
        const file = queue.pop()!;
        if (seen.has(file)) continue;
        seen.add(file);
        modules.push(file);
        for (const spec of moduleSpecifiers(file)) {
            const resolved = resolveInternalSpec(FRONTEND_ROOT, file, spec);
            if (resolved && !seen.has(resolved)) queue.push(resolved);
        }
    }
    return modules;
}

function relative(file: string): string {
    return path.relative(FRONTEND_ROOT, file).split(path.sep).join("/");
}

describe("shared presentation boundary", () => {
    it("keeps both presentation entries free of live access", () => {
        const graph = graphFrom(PRESENTATION_ENTRIES);
        const files = graph.map(relative);

        expect(files).toContain(
            "src/features/persona-catalog/presentation/roster-list.tsx"
        );
        expect(files).toContain(
            "src/features/knowledge/presentation/document-panel.tsx"
        );

        const forbidden = files.filter((file) =>
            FORBIDDEN_PREFIXES.some(
                (prefix) =>
                    file === prefix ||
                    file.startsWith(`${prefix}/`) ||
                    (prefix.endsWith(".ts") && file === prefix)
            )
        );
        expect(forbidden).toEqual([]);
    });

    it("proves the same walker catches a live component graph", () => {
        const live = graphFrom([LIVE_COMPONENT]).map(relative);
        expect(
            live.some((file) => file.startsWith("src/features/knowledge/api"))
        ).toBe(true);
    });
});
