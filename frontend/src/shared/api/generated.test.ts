/**
 * Contract for the generated DTO bindings (spec-05).
 *
 * The committed `generated.ts` must be exactly what the frozen OpenAPI
 * snapshot produces: when the backend contract changes, `npm run sync:openapi`
 * regenerates the bindings and this drift test fails until the new file is
 * committed alongside a refreshed `tests/fixtures/openapi.json`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import openapiTypescript, { astToString, COMMENT_HEADER } from 'openapi-typescript';

// happy-dom rewrites import.meta.url into the page origin, so anchor both the
// regenerated run and the committed file to the frontend project root.
const snapshotPath = join(process.cwd(), 'tests', 'fixtures', 'openapi.json');
const generatedPath = join(process.cwd(), 'src', 'shared', 'api', 'generated.ts');

const stripCarriageReturns = (source: string) => source.replace(/\r\n/g, '\n');

describe('generated bindings', () => {
    it('regenerates byte-identical bindings from the frozen snapshot', async () => {
        // Pass the parsed snapshot directly: the redoc loader that backs the
        // URL path misfires in a DOM-flavored test environment.
        const spec = JSON.parse(readFileSync(snapshotPath, 'utf8')) as Parameters<
            typeof openapiTypescript
        >[0];
        const ast = await openapiTypescript(spec);
        const regenerated = stripCarriageReturns(COMMENT_HEADER + astToString(ast));
        const committed = stripCarriageReturns(readFileSync(generatedPath, 'utf8'));

        expect(committed).toBe(regenerated);
    });

    it('freezes the meetings surface into the snapshot', () => {
        const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8')) as {
            paths: Record<string, unknown>;
        };

        expect(Object.keys(snapshot.paths)).toContain('/api/meetings');
    });
});
