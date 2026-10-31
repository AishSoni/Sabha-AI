/**
 * Replay composition boundary (spec-14).
 *
 * The recorded route is allowed to compose the real MeetingRoom and its
 * decoders, but its transitive module graph must not reach the live settings
 * store, BYOK vault, live provider cooldowns, or the live runtime slots. The
 * check walks the actual import graph, not interface names.
 */
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { resolveInternalSpec } from './checker';

const FRONTEND_ROOT = path.resolve(__dirname, '../..');
const REPLAY_ENTRY = path.join(
    FRONTEND_ROOT,
    'src/features/meetings/runtime/replay.tsx'
);
const DEMO_ROOT = path.join(FRONTEND_ROOT, 'src/app/demo');
const PUBLIC_ENTRIES = [
    path.join(FRONTEND_ROOT, 'src/app/layout.tsx'),
    path.join(FRONTEND_ROOT, 'src/app/providers.tsx'),
    path.join(FRONTEND_ROOT, 'src/app/page.tsx'),
    path.join(FRONTEND_ROOT, 'src/app/demo/layout.tsx'),
];

const FORBIDDEN_PREFIXES = [
    'src/features/settings',
    'src/features/access',
    'src/shared/access',
    'src/shared/credentials',
    'src/stores',
    'src/features/meetings/runtime/live',
    'src/lib/api',
    // Feature barrels and adapters still bind live HTTP clients/hooks.
    // Demo screens may only import deliberately extracted presentation.
    'src/features/persona-catalog/api',
    'src/features/persona-catalog/index.ts',
    'src/features/persona-catalog/ui/new-persona-screen.tsx',
    'src/features/persona-catalog/ui/persona-editor-screen.tsx',
    'src/features/persona-catalog/ui/roster-screen.tsx',
    'src/features/knowledge/api',
    'src/features/knowledge/hooks',
    'src/features/knowledge/components',
    'src/features/knowledge/index.ts',
];

function demoEntries(): string[] {
    const entries: string[] = [];
    const visit = (directory: string) => {
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
            const absolute = path.join(directory, entry.name);
            if (entry.isDirectory()) {
                visit(absolute);
            } else if (entry.name === 'page.tsx' || entry.name === 'layout.tsx') {
                entries.push(absolute);
            }
        }
    };
    visit(DEMO_ROOT);
    return entries;
}

function moduleSpecifiers(file: string): string[] {
    const source = fs.readFileSync(file, 'utf8');
    const parsed = ts.createSourceFile(
        file,
        source,
        ts.ScriptTarget.Latest,
        true,
        file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
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

function replayGraph(): string[] {
    return graphFrom([REPLAY_ENTRY, ...demoEntries()]);
}

function rel(file: string): string {
    return path.relative(FRONTEND_ROOT, file).split(path.sep).join('/');
}

describe('recorded replay module graph', () => {
    it('covers every demo route and layout', () => {
        const paths = demoEntries().map(rel);
        expect(paths).toContain('src/app/demo/layout.tsx');
        expect(paths).toContain('src/app/demo/page.tsx');
        expect(paths).toContain('src/app/demo/new/page.tsx');
        expect(paths).toContain('src/app/demo/meetings/page.tsx');
        expect(paths).toContain('src/app/demo/meetings/[id]/page.tsx');
        expect(paths).toContain('src/app/demo/knowledge-stacks/page.tsx');
        expect(paths).toContain('src/app/demo/knowledge-stacks/new/page.tsx');
        expect(paths).toContain(
            'src/app/demo/knowledge-stacks/[id]/page.tsx'
        );
    });

    it('composes the real room but never the live settings, vault, or stores', () => {
        const graph = replayGraph();
        const paths = graph.map(rel);

        // Non-vacuous: the real feature screen is in the composition.
        expect(paths).toContain('src/features/meetings/components/MeetingRoom.tsx');
        expect(paths).toContain('src/features/meetings/runtime/contract.ts');
        expect(paths).toContain('src/features/meetings/runtime/replay.tsx');

        for (const forbidden of FORBIDDEN_PREFIXES) {
            expect(
                paths.filter(
                    (candidate) =>
                        candidate === forbidden || candidate.startsWith(`${forbidden}/`)
                ),
                forbidden
            ).toEqual([]);
        }
    });

    it('recognizes a forbidden live feature import when it exists', () => {
        // Mechanism check: the walker must traverse into a known live feature
        // so a future demo import of that feature cannot pass unnoticed.
        const paths = graphFrom([
            path.join(FRONTEND_ROOT, 'src/app/(operator)/settings/page.tsx'),
        ]).map(rel);
        expect(
            paths.some((candidate) => candidate.startsWith('src/features/settings'))
        ).toBe(true);
    });

    it('keeps credential handoff out of the replay entry and shared room', () => {
        for (const file of [REPLAY_ENTRY, path.join(FRONTEND_ROOT, 'src/features/meetings/components/MeetingRoom.tsx')]) {
            const source = fs.readFileSync(file, 'utf8');
            expect(source).not.toContain('X-Provider-Key');
            expect(source).not.toContain('revealFromVault');
            expect(source).not.toContain('useSettingsStore');
        }
    });

    it('keeps the public shell and demos free of Auth/live access imports', () => {
        const paths = graphFrom(PUBLIC_ENTRIES).map(rel);

        expect(paths).toContain('src/app/layout.tsx');
        expect(paths).toContain('src/app/demo/layout.tsx');
        for (const forbidden of ['src/shared/access', 'src/features/access']) {
            expect(
                paths.filter(
                    (candidate) =>
                        candidate === forbidden || candidate.startsWith(`${forbidden}/`)
                ),
                forbidden
            ).toEqual([]);
        }
    });
});
