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
const DEMO_ROUTE = path.join(
    FRONTEND_ROOT,
    'src/app/demo/meetings/[id]/page.tsx'
);

const FORBIDDEN_PREFIXES = [
    'src/features/settings',
    'src/shared/credentials',
    'src/stores',
    'src/features/meetings/runtime/live',
    'src/lib/api',
];

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

function replayGraph(): string[] {
    const seen = new Set<string>();
    const queue = [REPLAY_ENTRY, DEMO_ROUTE];
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

function rel(file: string): string {
    return path.relative(FRONTEND_ROOT, file).split(path.sep).join('/');
}

describe('recorded replay module graph', () => {
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
                )
            ).toEqual([]);
        }
    });

    it('keeps credential handoff out of the replay entry and shared room', () => {
        for (const file of [REPLAY_ENTRY, path.join(FRONTEND_ROOT, 'src/features/meetings/components/MeetingRoom.tsx')]) {
            const source = fs.readFileSync(file, 'utf8');
            expect(source).not.toContain('X-Provider-Key');
            expect(source).not.toContain('revealFromVault');
            expect(source).not.toContain('useSettingsStore');
        }
    });
});
