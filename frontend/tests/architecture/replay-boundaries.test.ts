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

/**
 * Feature roots, adapters, and preview paths the demo composes. These are
 * explicit entries so a future refactor cannot drop one from the graph walk
 * while leaving the route inventory green.
 */
const DEMO_FEATURE_ENTRIES = [
    'src/features/demo-workspace/index.ts',
    'src/features/persona-catalog/local/index.ts',
    'src/features/knowledge/local/index.ts',
    'src/features/meetings/runtime/replay.tsx',
    'src/features/meetings/runtime/replay-run.tsx',
    'src/features/meetings/runtime/replay-session.tsx',
    'src/features/meetings/runtime/replay-evidence.ts',
    'src/features/meetings/runtime/chapters.ts',
    'src/features/meetings/runtime/playback-controls.tsx',
    'src/features/demo-tutorial/hud.tsx',
    'src/features/demo-tutorial/provider.tsx',
    'src/features/demo-tutorial/anchors.ts',
    'src/features/meetings/evidence/host.tsx',
    'src/features/meetings/evidence/provider.tsx',
    'src/features/meetings/evidence/trigger.tsx',
    'src/features/meetings/evidence/loader.ts',
    'src/features/meetings/evidence/renderers.tsx',
    'src/features/meetings/evidence/dialog.tsx',
];

const DEMO_ROUTE_FILES = [
    'src/app/demo/layout.tsx',
    'src/app/demo/page.tsx',
    'src/app/demo/knowledge-stacks/page.tsx',
    'src/app/demo/knowledge-stacks/new/page.tsx',
    'src/app/demo/knowledge-stacks/[id]/page.tsx',
    'src/app/demo/meetings/page.tsx',
    'src/app/demo/meetings/[id]/page.tsx',
    'src/app/demo/new/page.tsx',
    'src/app/demo/roster/page.tsx',
    'src/app/demo/roster/new/page.tsx',
    'src/app/demo/roster/[id]/page.tsx',
    'src/app/demo/roster/[id]/history/page.tsx',
    'src/app/demo/settings/page.tsx',
];

const DEMO_ROUTE_URLS = [
    '/demo',
    '/demo/knowledge-stacks',
    '/demo/knowledge-stacks/new',
    '/demo/knowledge-stacks/[id]',
    '/demo/meetings',
    '/demo/meetings/[id]',
    '/demo/new',
    '/demo/roster',
    '/demo/roster/new',
    '/demo/roster/[id]',
    '/demo/roster/[id]/history',
    '/demo/settings',
];

const FORBIDDEN_PREFIXES = [
    'src/features/settings',
    'src/features/access',
    'src/shared/access',
    'src/shared/credentials',
    'src/stores',
    'src/features/meetings/runtime/live',
    'src/features/meetings/runtime/live-evidence.ts',
    'src/features/meetings/runtime/live-documents-panel.tsx',
    'src/features/meetings/runtime/live-participant-action.tsx',
    'src/features/meetings/runtime/live-summary-panel.tsx',
    'src/features/meetings/api/client.ts',
    'src/features/meetings/api/turn-client.ts',
    'src/features/meetings/api/closing-client.ts',
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

function demoModules(): string[] {
    const entries: string[] = [];
    const visit = (directory: string) => {
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
            const absolute = path.join(directory, entry.name);
            if (entry.isDirectory()) {
                visit(absolute);
            } else if (
                /\.[cm]?[jt]sx?$/.test(entry.name) &&
                !/\.(test|spec)\.[cm]?[jt]sx?$/.test(entry.name)
            ) {
                entries.push(absolute);
            }
        }
    };
    visit(DEMO_ROOT);
    return entries;
}

function demoEntries(): string[] {
    return demoModules().filter((file) => {
        const name = path.basename(file);
        return name === 'page.tsx' || name === 'layout.tsx';
    });
}

function demoRouteUrl(file: string): string | null {
    const relative = path.relative(DEMO_ROOT, file).split(path.sep).join('/');
    if (relative === 'layout.tsx') return null;
    if (relative === 'page.tsx') return '/demo';
    if (!relative.endsWith('/page.tsx')) return null;
    return `/demo/${relative.slice(0, -'/page.tsx'.length)}`;
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
        } else if (
            ts.isCallExpression(node) &&
            node.expression.kind === ts.SyntaxKind.ImportKeyword
        ) {
            const first = node.arguments[0];
            if (first && ts.isStringLiteral(first)) {
                specs.push(first.text);
            }
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
    return graphFrom([
        REPLAY_ENTRY,
        ...demoModules(),
        ...DEMO_FEATURE_ENTRIES.map((entry) => path.join(FRONTEND_ROOT, entry)),
    ]);
}

function rel(file: string): string {
    return path.relative(FRONTEND_ROOT, file).split(path.sep).join('/');
}

describe('recorded replay module graph', () => {
    it('inventories every demo route file and URL', () => {
        const routes = demoEntries().map(rel).sort();
        expect(routes).toEqual([...DEMO_ROUTE_FILES].sort());

        const urls = demoEntries()
            .map(demoRouteUrl)
            .filter((url): url is string => url !== null)
            .sort();
        expect(urls).toEqual([...DEMO_ROUTE_URLS].sort());

        const modules = demoModules().map(rel);
        expect(modules).toContain('src/app/demo/demo-shell.tsx');
        expect(modules).toContain('src/app/demo/chapter-bootstrap.tsx');
        expect(modules).toContain(
            'src/app/demo/knowledge-stacks/[id]/stack-route.tsx'
        );
        expect(modules).toContain(
            'src/app/demo/meetings/[id]/recorded-meeting-route.tsx'
        );
        expect(modules).toContain(
            'src/app/demo/roster/[id]/persona-route.tsx'
        );
        expect(modules.filter((file) => /\.(test|spec)\./.test(file))).toEqual([]);
    });

    it('walks dynamic imports as well as static imports', () => {
        const specs = moduleSpecifiers(
            path.join(FRONTEND_ROOT, 'src/shared/access/browser-session.ts')
        );
        expect(specs).toContain('@supabase/supabase-js');
    });

    it('composes the real room but never the live settings, vault, or stores', () => {
        const graph = replayGraph();
        const paths = graph.map(rel);

        // Non-vacuous: the real feature screen, adapters, and preview path
        // are all in the composition.
        expect(paths).toContain('src/features/meetings/components/MeetingRoom.tsx');
        expect(paths).toContain('src/features/meetings/runtime/contract.ts');
        expect(paths).toContain('src/features/meetings/runtime/replay.tsx');
        expect(paths).toContain('src/features/meetings/runtime/replay-evidence.ts');
        expect(paths).toContain('src/features/meetings/evidence/host.tsx');
        expect(paths).toContain('src/features/meetings/evidence/loader.ts');
        for (const entry of DEMO_FEATURE_ENTRIES) {
            expect(paths, entry).toContain(entry);
        }

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
