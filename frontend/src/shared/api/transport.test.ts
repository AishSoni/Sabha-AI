/**
 * Transport contract for the no-sign-in workspace (spec-05).
 *
 * The shared transport is the single owner of HTTP failures, JSON and
 * multipart decoding, and the rule that browser requests never carry
 * user-auth headers, cookies, or any sign-in bootstrap. It also keeps
 * error outcomes structured (ApiError) so UI surfaces can distinguish
 * resource/validation failures from transport conditions without ever
 * assuming an authentication flow exists.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    ApiError,
    isApiError,
    requestForm,
    requestJson,
    resolveApiBaseUrl,
} from "./transport";
import { createScriptedFetch, type ScriptedFetch } from "../../../tests/fixtures/transport";

let fetcher: ScriptedFetch;

beforeEach(() => {
    // Suite parity runs may export NEXT_PUBLIC_API_URL for the hosted mode;
    // every default-base assertion in this file pins the env away itself so
    // the file stays deterministic in both modes.
    delete process.env.NEXT_PUBLIC_API_URL;
    fetcher = createScriptedFetch();
    fetcher.install();
});

afterEach(() => {
    fetcher.reset();
    vi.unstubAllGlobals();
});

describe("requestJson", () => {
    it("sends an absolute default-based URL and decodes a successful GET body", async () => {
        fetcher.enqueueJson(200, { name: "Roadmap review" });

        const meeting = await requestJson<{ name: string }>("/meetings");

        expect(meeting.name).toBe("Roadmap review");
        expect(fetcher.calls).toHaveLength(1);
        expect(fetcher.calls[0]?.input).toBe("http://localhost:8000/api/meetings");
        expect(fetcher.calls[0]?.init?.method).toBe("GET");
    });

    it("encodes POST bodies with the JSON content type and nothing else", async () => {
        fetcher.enqueueJson(201, { id: "m1" });

        const created = await requestJson<{ id: string }>("/meetings", {
            method: "POST",
            body: { name: "Roadmap review", agenda: "Ship the plan" },
        });

        expect(created.id).toBe("m1");
        expect(fetcher.calls[0]?.init?.method).toBe("POST");
        expect(JSON.parse(String(fetcher.calls[0]?.init?.body))).toEqual({
            name: "Roadmap review",
            agenda: "Ship the plan",
        });
        expect(fetcher.calls[0]?.init?.headers).toEqual({
            "Content-Type": "application/json",
        });
    });

    it("appends query parameters and skips blank entries", async () => {
        fetcher.enqueueJson(200, { personas: [], total: 0 });

        await requestJson("/personas", {
            query: { user_id: "u-7", include_defaults: true, stale: undefined },
        });

        expect(fetcher.calls[0]?.input).toBe(
            "http://localhost:8000/api/personas?user_id=u-7&include_defaults=true"
        );
    });

    it("propagates an AbortSignal to the underlying fetch", async () => {
        fetcher.enqueueJson(200, []);
        const controller = new AbortController();

        await requestJson("/meetings", { signal: controller.signal });

        expect(fetcher.calls[0]?.init?.signal).toBe(controller.signal);
    });

    it("merges caller headers with the JSON content type", async () => {
        fetcher.enqueueJson(200, { id: "turn-1" });

        await requestJson("/meetings/m1/turns", {
            method: "POST",
            headers: { "X-Provider-Key": "sk-live-secret" },
            body: { participant_id: "p1", request_key: "r1" },
        });

        expect(fetcher.calls[0]?.init?.headers).toEqual({
            "X-Provider-Key": "sk-live-secret",
            "Content-Type": "application/json",
        });
    });
});

describe("structured transport failures", () => {
    it("maps an HTTP validation failure to an ApiError with status, detail and http kind", async () => {
        fetcher.enqueueJson(422, { detail: "Agenda must not be empty" });

        const failure = await requestJson("/meetings", {
            method: "POST",
            body: { name: "" },
        }).catch((error: unknown) => error);

        expect(isApiError(failure)).toBe(true);
        const apiError = failure as ApiError;
        expect(apiError).toBeInstanceOf(ApiError);
        expect(apiError.kind).toBe("http");
        expect(apiError.status).toBe(422);
        expect(apiError.detail).toBe("Agenda must not be empty");
        expect(apiError.message).toBe("Agenda must not be empty");
    });

    it("keeps the legacy fallback detail when the failure body is not usable", async () => {
        // Failure body that cannot be decoded as JSON at all.
        const unparsable = async (): Promise<Response> =>
            ({
                ok: false,
                status: 500,
                json: async () => {
                    throw new Error("invalid json");
                },
            }) as unknown as Response;
        vi.stubGlobal("fetch", unparsable);

        const failure = await requestJson("/meetings").catch((error: unknown) => error);

        const apiError = failure as ApiError;
        expect(isApiError(apiError)).toBe(true);
        expect(apiError.kind).toBe("http");
        expect(apiError.status).toBe(500);
        expect(apiError.detail).toBe("Unknown error");
    });

    it("keeps the legacy per-status fallback when the detail field is missing", async () => {
        fetcher.enqueueJson(404, { message: "wrong shape" });

        const failure = await requestJson("/meetings/not-here").catch(
            (error: unknown) => error,
        );

        const apiError = failure as ApiError;
        expect(apiError.kind).toBe("http");
        expect(apiError.status).toBe(404);
        expect(apiError.detail).toBe("API Error: 404");
    });

    it("treats an authorization-style failure as an ordinary resource error, never as an auth prompt", async () => {
        fetcher.enqueueJson(401, { detail: "Provider rejected the key" });

        const failure = await requestJson("/settings/providers").catch(
            (error: unknown) => error,
        );

        const apiError = failure as ApiError;
        expect(apiError.kind).toBe("http");
        expect(apiError.status).toBe(401);
        expect(apiError.detail).toBe("Provider rejected the key");
    });

    it("maps connection failures to a network kind with a safe detail", async () => {
        fetcher.enqueueFailure(new Error("ECONNREFUSED"));

        const failure = await requestJson("/meetings").catch((error: unknown) => error);

        const apiError = failure as ApiError;
        expect(isApiError(apiError)).toBe(true);
        expect(apiError.kind).toBe("network");
        expect(apiError.status).toBeNull();
        expect(apiError.detail).toBe("Network request failed");
    });

    it("recognizes an aborted request as its own kind", async () => {
        const abortError = new Error("The operation was aborted");
        abortError.name = "AbortError";
        fetcher.enqueueFailure(abortError);

        const failure = await requestJson("/meetings", {
            signal: AbortSignal.abort(),
        }).catch((error: unknown) => error);

        const apiError = failure as ApiError;
        expect(apiError.kind).toBe("aborted");
        expect(apiError.status).toBeNull();
    });

    it("still surfaces a structured error when a successful response carries no JSON", async () => {
        const unparsable = async (): Promise<Response> =>
            ({
                ok: true,
                status: 200,
                json: async () => {
                    throw new Error("unparseable body");
                },
            }) as unknown as Response;
        vi.stubGlobal("fetch", unparsable);

        const failure = await requestJson("/meetings").catch((error: unknown) => error);
        const apiError = failure as ApiError;
        expect(isApiError(apiError)).toBe(true);
        expect(apiError.kind).toBe("http");
        expect(apiError.status).toBe(200);
        expect(apiError.detail).toBe("Unexpected response from the server");
    });
});

describe("requestForm", () => {
    it("sends multipart bodies without setting a content type header", async () => {
        fetcher.enqueueJson(201, { id: "d1", file_name: "notes.md" });
        const form = new FormData();
        form.append("file", new Blob(["meeting notes"], { type: "text/markdown" }), "notes.md");

        const uploaded = await requestForm<{ id: string }>("/documents/upload", form);

        expect(uploaded.id).toBe("d1");
        expect(fetcher.calls[0]?.input).toBe("http://localhost:8000/api/documents/upload");
        expect(fetcher.calls[0]?.init?.method).toBe("POST");
        expect(fetcher.calls[0]?.init?.body).toBe(form);
        expect(fetcher.calls[0]?.init?.headers).toBeUndefined();
    });

    it("surfaces multipart upload failures as structured ApiErrors", async () => {
        fetcher.enqueueJson(413, { detail: "Upload exceeds the size limit" });
        const form = new FormData();
        form.append("file", new Blob(["too big"]), "big.bin");

        const failure = await requestForm("/documents/upload", form).catch(
            (error: unknown) => error,
        );

        const apiError = failure as ApiError;
        expect(isApiError(apiError)).toBe(true);
        expect(apiError.status).toBe(413);
        expect(apiError.detail).toBe("Upload exceeds the size limit");
    });
});

describe("no-sign-in invariants", () => {
    it("never attaches auth headers, cookies, or credential hints to any request", async () => {
        fetcher.enqueueJson(200, []);
        fetcher.enqueueJson(200, []);
        const form = new FormData();
        form.append("file", new Blob(["x"]), "x.txt");
        fetcher.enqueueJson(200, {});

        await requestJson("/meetings");
        await requestJson("/meetings", { method: "POST", body: {} });
        await requestForm("/documents/upload", form);

        for (const call of fetcher.calls) {
            const headers = (call.init?.headers ?? {}) as Record<string, unknown>;
            for (const key of Object.keys(headers)) {
                expect(key.toLowerCase()).not.toMatch(/^authorization$/);
                expect(key.toLowerCase()).not.toContain("cookie");
                expect(key.toLowerCase()).not.toMatch(/^x-user-/);
            }
            const credentials = (call.init as { credentials?: unknown } | undefined)
                ?.credentials;
            expect(credentials === undefined || credentials === "same-origin").toBe(true);
        }
    });
});

describe("base resolution", () => {
    it("uses the deployed base from the environment, else the local default", () => {
        const previous = process.env.NEXT_PUBLIC_API_URL;
        try {
            process.env.NEXT_PUBLIC_API_URL = "https://hosted.example.com/api";
            expect(resolveApiBaseUrl()).toBe("https://hosted.example.com/api");

            delete process.env.NEXT_PUBLIC_API_URL;
            expect(resolveApiBaseUrl()).toBe("http://localhost:8000/api");
        } finally {
            if (previous !== undefined) {
                process.env.NEXT_PUBLIC_API_URL = previous;
            } else {
                delete process.env.NEXT_PUBLIC_API_URL;
            }
        }
    });
});
