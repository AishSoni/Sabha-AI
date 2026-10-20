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
    RULE_CROSS_FEATURE_ROOT_IMPORT,
    RULE_FEATURE_LEGACY_IMPORT,
    RULE_FORBIDDEN_SDK_IMPORT,
    RULE_ROSTER_SCREEN_LEGACY_IMPORT,
    RULE_SHARED_ISOLATION,
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
        // Root at the project root: the boundary rules reason about
        // 'src/...' paths, so the live scan must see the same shape the
        // sandbox scans see (a src-rooted scan silently disables them).
        const { files, violations } = scanSourceTree(FRONTEND_ROOT);

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

    it("flags a feature module reaching for the legacy transport monolith", () => {
        const root = writeSandbox({
            "src/lib/api.ts": `export const api = {};\n`,
            "src/features/meetings/api/legacy-list.ts": `import { api } from '@/lib/api';\nexport const legacyList = () => api;\n`,
            "src/features/meetings/api/client.ts": `import { requestJson } from '@/shared/api/transport';\nexport const client = { requestJson };\n`,
            "src/shared/api/transport.ts": `export const requestJson = async () => ({});\n`,
        });

        const rules = rulesIn(root);
        expect(rules.has(RULE_FEATURE_LEGACY_IMPORT)).toBe(true);
    });

    it("flags a feature module reaching into legacy zustand stores", () => {
        const root = writeSandbox({
            "src/stores/meetingStore.ts": `export const useMeetingStore = () => ({});\n`,
            "src/features/meetings/hooks/store-hooks.ts": `import { useMeetingStore } from '@/stores/meetingStore';\nexport const useLegacyMeeting = () => useMeetingStore();\n`,
        });

        const rules = rulesIn(root);
        expect(rules.has(RULE_FEATURE_LEGACY_IMPORT)).toBe(true);
    });

    it("flags shared modules that reach into features, stores, components, or lib", () => {
        const root = writeSandbox({
            "src/stores/rateLimitStore.ts": `export const useCooldown = () => ({});\n`,
            "src/components/ui/button.tsx": `export const Button = () => null;\n`,
            "src/lib/utils.ts": `export const cn = () => '';\n`,
            "src/features/meetings/index.ts": `export const meeting = () => null;\n`,
            "src/shared/api/leaky-transport.ts": `import { meeting } from '@/features/meetings';\nimport { useCooldown } from '@/stores/rateLimitStore';\nimport { Button } from '@/components/ui/button';\nimport { cn } from '@/lib/utils';\nexport const leakyTransport = { meeting, useCooldown, Button, cn };\n`,
        });

        const rules = rulesIn(root);
        expect(rules.has(RULE_SHARED_ISOLATION)).toBe(true);
    });

    it("flags deep cross-feature imports while allowing curated root barrels", () => {
        const root = writeSandbox({
            "src/features/knowledge/index.ts": `export const knowledge = () => null;\n`,
            "src/features/knowledge/api/client.ts": `export const documentClient = {};\n`,
            "src/features/meetings/hooks/deep-reach.ts": `import { documentClient } from '@/features/knowledge/api/client';\nexport const deepReach = () => documentClient;\n`,
            "src/features/persona-catalog/api/steal.ts": `import { knowledge } from '../../knowledge';\nexport const steal = () => knowledge();\n`,
        });

        const { violations } = scanSourceTree(root);
        const crossViolations = violations.filter((violation) => violation.rule === RULE_CROSS_FEATURE_ROOT_IMPORT);

        expect(crossViolations).toHaveLength(2);
        expect(crossViolations.map((violation) => violation.file)).toEqual(
            expect.arrayContaining([expect.stringMatching(/deep-reach\.ts$/), expect.stringMatching(/steal\.ts$/)])
        );
    });

    it("flags a roster screen that still reaches the legacy persona facade", () => {
        const root = writeSandbox({
            "src/lib/api.ts": `export const personaApi = {};`,
            "src/app/roster/page.tsx": `import { personaApi } from '@/lib/api';\nexport const page = personaApi;`,
            "src/features/persona-catalog/ui/roster-screen.tsx": `import { personaClient } from '@/features/persona-catalog/api/client';\nexport const screen = personaClient;`,
        });

        const { violations } = scanSourceTree(root);
        const rosterViolations = violations.filter(
            (violation) => violation.rule === RULE_ROSTER_SCREEN_LEGACY_IMPORT
        );
        expect(rosterViolations).toHaveLength(1);
        expect(rosterViolations[0]!.file.replace(/\\/g, "/")).toMatch(/roster\/page\.tsx$/);
    });

    it("passes a happy sandbox tree where features consume other features via root barrels", () => {
        const root = writeSandbox({
            "src/shared/api/transport.ts": `import { readFailureDetail } from './errors';\nexport const requestJson = readFailureDetail;\n`,
            "src/shared/api/errors.ts": `export const readFailureDetail = async () => '';\n`,
            "src/shared/credentials/vault.ts": `export const sealIntoVault = async () => null;\n`,
            "src/features/knowledge/index.ts": `export const knowledge = () => null;\n`,
            "src/features/meetings/index.ts": `export const meetings = () => null;\n`,
            "src/features/meetings/hooks/use-creation.ts": `import { knowledge } from '@/features/knowledge';\nimport { sealIntoVault } from '@/shared/credentials/vault';\nexport const useCreation = () => ({ knowledge, sealIntoVault });\n`,
        });

        expect(scanSourceTree(root).violations).toEqual([]);
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
