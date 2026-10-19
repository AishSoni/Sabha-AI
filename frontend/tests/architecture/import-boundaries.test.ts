/**
 * Frontend import-boundary tests (spec-03, checker engine in ./checker).
 *
 * The live scan proves the frontend has no Supabase/provider SDK usage and
 * holds the curated UI/store boundary today; the sandbox scans prove the
 * checker itself rejects planted violations (non-vacuous), not happy trees
 * only. Allowlist entries are kept honest by a liveness test that fails if
 * an exception no longer matches a real import.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
    RULE_FORBIDDEN_SDK_IMPORT,
    RULE_STORE_IMPORT_IN_UI,
    RULE_TEST_IMPORT_IN_ROUTE,
    UI_STORE_ALLOWLIST,
    scanSourceTree,
} from "./checker";

const FRONTEND_ROOT = path.resolve(__dirname, "../..");
const SRC_ROOT = path.join(FRONTEND_ROOT, "src");

function writeSandbox(files: Record<string, string>): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "frontend-boundary-"));
    for (const [rel, content] of Object.entries(files)) {
        const abs = path.join(root, rel);
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, content);
    }
    return root;
}

function rulesIn(root: string): Set<string> {
    return new Set(scanSourceTree(root).violations.map((violation) => violation.rule));
}

describe("live source tree boundaries", () => {
    it("src is SDK-free and keeps curated UI/store imports only", () => {
        const { files, violations } = scanSourceTree(SRC_ROOT);

        // Non-vacuous: the app tree is large and the scan really parsed it.
        expect(files.length).toBeGreaterThan(50);
        expect(violations).toEqual([]);
    });

    it("every curated UI-store exception still matches a real import", () => {
        // The exception list must not outlive the imports it licenses.
        expect(UI_STORE_ALLOWLIST.length).toBeGreaterThan(0);
        for (const [uiFile, storeModule] of UI_STORE_ALLOWLIST) {
            const content = fs.readFileSync(path.join(FRONTEND_ROOT, uiFile), "utf8");
            const wants = storeModule.startsWith("src/stores/") ? `@/${storeModule.slice("src/".length)}` : `@/${storeModule}`;
            expect(content.includes(`'${wants}'`)).toBe(true);
        }
    });
});

describe("checker rejects planted violations (sandbox)", () => {
    it("flags a planted Supabase SDK import", () => {
        const root = writeSandbox({
            "src/app/page.tsx": `import { createClient } from '@supabase/supabase-js';\nexport const page = () => null;\n`,
        });

        const rules = rulesIn(root);
        expect(rules.has(RULE_FORBIDDEN_SDK_IMPORT)).toBe(true);
    });

    it("flags a planted provider SDK import and passes legal bare imports", () => {
        const root = writeSandbox({
            "src/lib/ask.ts": `import OpenAI from 'openai';\nexport const ask = () => null;\n`,
            "src/lib/types.ts": `import type { ReactNode } from 'react';\nexport type Node = ReactNode;\n`,
        });

        const rules = rulesIn(root);
        expect(rules.has(RULE_FORBIDDEN_SDK_IMPORT)).toBe(true);
    });

    it("flags unknown UI store imports while allowing curated ones", () => {
        const root = writeSandbox({
            "src/stores/meetingStore.ts": `export const useMeetingStore = () => ({});\n`,
            "src/stores/rateLimitStore.ts": `export const useCooldown = () => ({});\n`,
            "src/components/ui/card.tsx": `import { useMeetingStore } from '@/stores/meetingStore';\nexport const Card = () => null;\n`,
            "src/components/ui/rate-limited-button.tsx": `import { useCooldown } from '@/stores/rateLimitStore';\nexport const RateLimitedButton = () => null;\n`,
        });

        const { violations } = scanSourceTree(root);
        const storeViolations = violations.filter((violation) => violation.rule === RULE_STORE_IMPORT_IN_UI);

        expect(storeViolations).toHaveLength(1);
        expect(storeViolations[0]!.file).toMatch(/card\.tsx$/);
    });

    it("flags routes importing test modules, both via alias and via relative path", () => {
        const root = writeSandbox({
            "src/test/setup.ts": `export const ready = true;\n`,
            "src/tests/helpers.ts": `export const help = () => null;\n`,
            "src/app/page.tsx": `import { ready } from '@/test/setup';\nexport const page = () => null;\n`,
            "src/app/other.tsx": `import { help } from '../tests/helpers';\nexport const other = () => null;\n`,
        });

        const rules = rulesIn(root);
        expect(rules).toContain(RULE_TEST_IMPORT_IN_ROUTE);
    });

    it("passes a happy sandbox tree with ui reading lib and features-free layout", () => {
        const root = writeSandbox({
            "src/lib/utils.ts": `export const cn = () => '';\n`,
            "src/components/ui/button.tsx": `import { cn } from '@/lib/utils';\nimport * as DialogPrimitive from '@radix-ui/react-dialog';\nexport const Button = { cn, DialogPrimitive };\n`,
            "src/stores/settings-store.ts": `export const useSettingsStore = () => ({});\n`,
            "src/app/settings.tsx": `import { useSettingsStore } from '@/stores/settings-store';\nexport const settings = () => null;\n`,
        });

        expect(scanSourceTree(root).violations).toEqual([]);
    });
});
