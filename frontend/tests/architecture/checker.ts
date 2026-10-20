/**
 * Frontend import-boundary checker (spec-03).
 *
 * Engine mirrors the backend AST checker: walk TypeScript sources with the
 * real "typescript" compiler API, resolve import specifiers (relative, the
 * project alias, and bare packages), and flag the boundaries that are TRUE
 * for this codebase today:
 *
 * - no source file imports the Supabase browser SDK or a provider SDK;
 *   the app is fully SDK-free and server-authoritative (zero usage today);
 * - src/components/ui files are generic presentation: imports of app state
 *   stores must be curated. Exactly one exception is allowed today
 *   (ui/rate-limited-button.tsx reads the rate-limit store) and the list is
 *   deliberately explicit so new exceptions are conscious decisions;
 * - route files under src/app never import test modules.
 *
 * Feature- and shared-owned boundaries (Spec 05):
 * - files under src/features never import the legacy '@/lib/api' monolith or
 *   legacy stores; they own their transport, keys, queries, and mutations;
 * - features consume other features only through the other feature's root
 *   barrel '@/features/<name>' (documented public-interface direction);
 * - src/shared modules (shared transport, generated bindings, credential
 *   vault) import no app modules — features, stores, components, app, lib;
 *   they stay shape-agnostic on purpose.
 *
 * Nothing is skipped silently without documentation here.
 */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

export const FORBIDDEN_SDK_PACKAGES = new Set([
    "@supabase/supabase-js",
    "supabase",
    "openai",
    "cohere",
    "@cohere-ai/sdk",
    "anthropic",
    "@anthropic-ai/sdk",
]);

/**
 * Curated UI-store exceptions, as [uiFileRelativeToSrc, storeModuleRelativeToSrc].
 * The live-tree test asserts each entry still matches a real import.
 */
export const UI_STORE_ALLOWLIST: ReadonlyArray<readonly [string, string]> = [
    ["src/components/ui/rate-limited-button.tsx", "src/stores/rateLimitStore"],
];

export interface ImportEdge {
    file: string;
    /** Raw module specifier as written in the source. */
    spec: string;
    /** For bare packages: the package name (@scope/name or first segment). */
    packageName: string | null;
    /** Absolute normalized path for relative and "@" specs; null otherwise. */
    resolved: string | null;
}

export interface Violation {
    file: string;
    spec: string;
    rule: string;
    message: string;
}

export const RULE_FORBIDDEN_SDK_IMPORT = "forbidden_sdk_import";
export const RULE_STORE_IMPORT_IN_UI = "store_import_in_ui";
export const RULE_TEST_IMPORT_IN_ROUTE = "test_import_in_route";
export const RULE_FEATURE_LEGACY_IMPORT = "feature_legacy_import";
export const RULE_SHARED_ISOLATION = "shared_isolation";
export const RULE_CROSS_FEATURE_ROOT_IMPORT = "cross_feature_root_import";
export const RULE_ROSTER_SCREEN_LEGACY_IMPORT = "roster_screen_legacy_import";

/** Root barrels consuming other features use exactly this alias shape. */
function featureRootSpec(feature: string): string {
    return `@/features/${feature}`;
}

function featureNameOf(rel: string): string | null {
    const segments = rel.split("/");
    if (segments.length >= 3 && segments[0] === "src" && segments[1] === "features") {
        return segments[2]!;
    }
    return null;
}

function toPosix(p: string): string {
    return p.split(path.sep).join("/");
}

function packageNameOf(spec: string): string | null {
    const segments = spec.split("/");
    if (spec.startsWith("@")) {
        if (segments.length < 2) {
            return spec;
        }
        return segments.slice(0, 2).join("/");
    }
    return segments[0];
}

const bare = (spec: string): boolean => !spec.startsWith(".") && !spec.startsWith("@/") && !spec.startsWith("/");

/** true for the project alias prefix (at-sign-slash) only. */
function isAliasSpec(spec: string): boolean {
    return spec.startsWith("@/");
}

/**
 * Resolve an internal module specifier to an absolute normalized path.
 * Extensionless specs are probed with .ts/.tsx like TS module resolution.
 */
export function resolveInternalSpec(projectRoot: string, importerAbs: string, spec: string): string | null {
    const root = toPosix(projectRoot);
    let candidate: string;
    if (isAliasSpec(spec)) {
        candidate = path.join(projectRoot, "src", spec.slice(2));
    } else if (spec.startsWith(".") || spec.startsWith("/")) {
        candidate = path.resolve(path.dirname(importerAbs), spec);
    } else {
        return null;
    }
    if (/\.[cm]?[jt]sx?$/.test(candidate)) {
        return toPosix(candidate);
    }
    if (fs.existsSync(`${candidate}.ts`)) {
        return toPosix(`${candidate}.ts`);
    }
    if (fs.existsSync(`${candidate}.tsx`)) {
        return toPosix(`${candidate}.tsx`);
    }
    return toPosix(candidate);
}

export function isTestModule(projectRoot: string, resolvedPath: string): boolean {
    const normalized = toPosix(resolvedPath);
    const root = toPosix(projectRoot);
    return (
        normalized.startsWith(`${root}/src/test/`) ||
        normalized.startsWith(`${root}/tests/`) ||
        /\.test\.[cm]?[jt]sx?$/.test(normalized) ||
        /\.spec\.[cm]?[jt]sx?$/.test(normalized)
    );
}

function relToRoot(projectRoot: string, filePath: string): string {
    const rel = toPosix(path.relative(projectRoot, filePath));
    return rel.replace(/^\.\//, "");
}

function collectImportEdges(projectRoot: string, fileAbs: string, source: ts.SourceFile): ImportEdge[] {
    const edges: ImportEdge[] = [];
    const push = (spec: string): void => {
        edges.push({
            file: fileAbs,
            spec,
            packageName: bare(spec) ? packageNameOf(spec) : null,
            resolved: resolveInternalSpec(projectRoot, fileAbs, spec),
        });
    };

    const visit = (node: ts.Node): void => {
        if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
            push(node.moduleSpecifier.text);
        } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
            push(node.moduleSpecifier.text);
        } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
            const first = node.arguments[0];
            if (first && ts.isStringLiteral(first)) {
                push(first.text);
            }
        }
        ts.forEachChild(node, visit);
    };

    ts.forEachChild(source, visit);
    return edges;
}

function walkSources(root: string): string[] {
    const out: string[] = [];
    const skip = new Set(["node_modules", ".next", ".git"]);
    const stack = [root];
    while (stack.length > 0) {
        const current = stack.pop()!;
        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
            if (entry.isDirectory()) {
                if (skip.has(entry.name)) {
                    continue;
                }
                stack.push(path.join(current, entry.name));
                continue;
            }
            if (/\.[cm]?[jt]sx?$/.test(entry.name)) {
                out.push(path.join(current, entry.name));
            }
        }
    }
    return out.sort();
}

/**
 * Scan every TypeScript source under `root` and report which files plus the
 * violations of the three documented rules.
 */
export function scanSourceTree(root: string): { files: string[]; violations: Violation[] } {
    const files = walkSources(root);
    const violations: Violation[] = [];

    for (const file of files) {
        const source = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
        for (const edge of collectImportEdges(root, file, source)) {
            // Rule: the frontend must stay free of the Supabase browser SDK
            // and provider SDKs (server-authoritative, no-sign-in doctrine).
            if (edge.packageName && FORBIDDEN_SDK_PACKAGES.has(edge.packageName)) {
                violations.push({
                    file,
                    spec: edge.spec,
                    rule: RULE_FORBIDDEN_SDK_IMPORT,
                    message: `'${edge.spec}' is a forbidden SDK import in frontend sources.`,
                });
            }

            const fileRel = relToRoot(root, edge.file);
            if (edge.resolved) {
                const targetRel = relToRoot(root, edge.resolved);
                if (fileRel.startsWith("src/components/ui/") && targetRel.startsWith("src/stores/")) {
                    // Rule: generic UI primitives must own a curated reason to
                    // read app state; unknown pairs are flagged for review.
                    const allowed = UI_STORE_ALLOWLIST.some(
                        ([ui, store]) => ui === fileRel && targetRel.startsWith(store)
                    );
                    if (!allowed) {
                        violations.push({
                            file,
                            spec: edge.spec,
                            rule: RULE_STORE_IMPORT_IN_UI,
                            message: `'${fileRel}' imports app state '${targetRel}' which is not in the curated UI allowlist.`,
                        });
                    }
                }
                if (fileRel.startsWith("src/app/") && isTestModule(root, edge.resolved)) {
                    violations.push({
                        file,
                        spec: edge.spec,
                        rule: RULE_TEST_IMPORT_IN_ROUTE,
                        message: `Route '${fileRel}' imports test module '${targetRel}'.`,
                    });
                }

                if (fileRel.startsWith("src/app/roster/") && targetRel === "src/lib/api.ts") {
                    // Rule (spec 06): roster screens consume the persona
                    // catalog feature, not the legacy facade. Screens get
                    // thin app shells; behavior lives in the feature.
                    violations.push({
                        file,
                        spec: edge.spec,
                        rule: RULE_ROSTER_SCREEN_LEGACY_IMPORT,
                        message: `Roster screen '${fileRel}' must import the persona-catalog feature, not legacy '${targetRel}'.`,
                    });
                }

                // Rule: features own their transport/keys/queries and never
                // reach back into the legacy monolith or the zustand stores.
                const importerFeature = featureNameOf(fileRel);
                if (importerFeature) {
                    const legacyTarget =
                        targetRel === "src/lib/api.ts" || targetRel.startsWith("src/stores/");
                    if (legacyTarget) {
                        violations.push({
                            file,
                            spec: edge.spec,
                            rule: RULE_FEATURE_LEGACY_IMPORT,
                            message: `Feature '${importerFeature}' ('${fileRel}') must not import legacy '${targetRel}'.`,
                        });
                    }
                    // Rule: features consume other features only through the
                    // documented public interface — the feature's root barrel.
                    if (targetRel.startsWith("src/features/")) {
                        const targetFeature = featureNameOf(targetRel)!;
                        const sameFeature = targetFeature === importerFeature;
                        const throughRoot =
                            edge.spec === featureRootSpec(targetFeature) ||
                            edge.spec.startsWith(`${featureRootSpec(targetFeature)}/index`);
                        if (!sameFeature && !throughRoot) {
                            violations.push({
                                file,
                                spec: edge.spec,
                                rule: RULE_CROSS_FEATURE_ROOT_IMPORT,
                                message: `Feature '${importerFeature}' must consume feature '${targetFeature}' through its root barrel ('${featureRootSpec(targetFeature)}'), not '${edge.spec}'.`,
                            });
                        }
                    }
                }

                // Rule: shared code stays shape-agnostic — no features,
                // stores, components, or lib reach-ins.
                if (fileRel.startsWith("src/shared/")) {
                    const sharedForbidden =
                        targetRel.startsWith("src/features/") ||
                        targetRel.startsWith("src/stores/") ||
                        targetRel.startsWith("src/components/") ||
                        targetRel.startsWith("src/app/") ||
                        targetRel.startsWith("src/lib/") ||
                        targetRel.startsWith("src/test/");
                    if (sharedForbidden) {
                        violations.push({
                            file,
                            spec: edge.spec,
                            rule: RULE_SHARED_ISOLATION,
                            message: `Shared module '${fileRel}' must not import app module '${targetRel}'.`,
                        });
                    }
                }
            }
        }
    }

    return { files, violations };
}
