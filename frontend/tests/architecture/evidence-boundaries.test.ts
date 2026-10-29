/**
 * Evidence preview boundary (spec 21).
 *
 * There is one dialog, one set of renderers, and one loader. Both runtime
 * compositions plug into it; no feature may grow a second Markdown/PDF viewer.
 * The shared evidence module must stay runtime-neutral.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const FRONTEND_ROOT = path.resolve(__dirname, '../..');
const SRC = path.join(FRONTEND_ROOT, 'src');
const EVIDENCE = path.join(SRC, 'features/meetings/evidence');

function walk(dir: string): string[] {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    return entries.flatMap((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return walk(full);
        return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
    });
}

function rel(file: string): string {
    return path.relative(FRONTEND_ROOT, file).split(path.sep).join('/');
}

const sourceFiles = walk(SRC);

describe('shared evidence preview boundary', () => {
    it('keeps Markdown and PDF rendering inside the one evidence module', () => {
        const importers = sourceFiles.filter((file) => {
            const source = fs.readFileSync(file, 'utf8');
            return (
                source.includes('react-markdown') ||
                source.includes('remark-gfm') ||
                source.includes('<iframe')
            );
        });

        expect(importers.length).toBeGreaterThan(0);
        for (const file of importers) {
            // MeetingRoom renders chat prose, not evidence; everything else that
            // renders Markdown/PDF must live in the one evidence renderer.
            expect([
                'src/features/meetings/evidence/renderers.tsx',
                'src/features/meetings/components/MeetingRoom.tsx',
                'src/features/meetings/runtime/live-summary-panel.tsx',
            ]).toContain(rel(file));
        }

        const evidenceRenderers = sourceFiles.filter((file) => {
            if (file.includes('.test.')) return false;
            const source = fs.readFileSync(file, 'utf8');
            return (
                source.includes('EvidenceContentRenderer') ||
                source.includes('EvidencePreviewDialog')
            );
        });
        for (const file of evidenceRenderers) {
            expect(rel(file)).toMatch(
                /^src\/features\/meetings\/evidence\/(renderers|dialog|host)\.tsx$/
            );
        }
    });

    it('keeps the evidence module independent of both runtime compositions', () => {
        const forbidden = [
            'runtime/live',
            'runtime/replay',
            'features/knowledge',
            '@/stores',
            'shared/credentials',
        ];
        for (const file of walk(EVIDENCE)) {
            const source = fs.readFileSync(file, 'utf8');
            for (const specifier of forbidden) {
                expect(source).not.toContain(specifier);
            }
        }
    });

    it('exposes the evidence API on the shared runtime contract', () => {
        const contract = fs.readFileSync(
            path.join(SRC, 'features/meetings/runtime/contract.ts'),
            'utf8'
        );
        expect(contract).toContain('../evidence/contract');
        expect(contract).toContain('evidence?: MeetingsEvidenceApi');
    });
});
