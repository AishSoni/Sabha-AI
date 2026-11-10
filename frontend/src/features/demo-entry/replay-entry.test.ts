import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/shared/api/errors";
import {
    clearEntryHandoff,
    loadReplayEntry,
    peekEntryHandoff,
    ReplayEntryError,
    replayEntryFailureMessage,
    stageEntryHandoff,
    type ReplayEntry,
} from "@/features/demo-entry";

const SESSION = {
    meeting_id: "11111111-1111-4111-8111-111111111111",
    initial_checkpoint: "checkpoint-initial",
    package_id: "placeholder-analyst",
    package_version: "1",
    content_sha256: "a".repeat(64),
};

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
    });
}

function validConfig() {
    return { board: {}, intake: {} };
}

afterEach(() => {
    clearEntryHandoff();
    vi.useRealTimers();
});

describe("shared replay entry acquisition", () => {
    it("reads the session first, then metadata for that pinned checkpoint", async () => {
        const calls: string[] = [];
        const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input);
            calls.push(url);
            if (url.endsWith("/replay/session")) return json(SESSION);
            if (url.includes("/safe-config")) return json(validConfig());
            throw new Error(`Unexpected request: ${url}`);
        });

        const entry = await loadReplayEntry({ fetchImpl });

        expect(entry.session).toMatchObject(SESSION);
        expect(entry.safeConfig).toEqual(validConfig());
        expect(entry.checkpoint).toBe("checkpoint-initial");
        expect(calls[0]).toMatch(/\/replay\/session$/);
        expect(calls[1]).toContain(
            `/replay/meetings/${SESSION.meeting_id}/safe-config`
        );
        expect(calls[1]).toContain("checkpoint=checkpoint-initial");
    });

    it("retries metadata only when given a pinned session", async () => {
        const calls: string[] = [];
        const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input);
            calls.push(url);
            if (url.includes("/safe-config")) return json(validConfig());
            throw new Error(`Unexpected request: ${url}`);
        });

        const entry = await loadReplayEntry({
            fetchImpl,
            session: SESSION,
        });

        expect(entry.session).toMatchObject(SESSION);
        expect(calls).toHaveLength(1);
        expect(calls[0]).not.toContain("/replay/session");
    });

    it("rejects incomplete safe config without losing the pinned session", async () => {
        const fetchImpl = vi.fn(async () => json({ board: {} }));

        await expect(
            loadReplayEntry({ fetchImpl, session: SESSION })
        ).rejects.toMatchObject({
            stage: "metadata",
            session: SESSION,
        });
    });

    it("maps missing metadata to the entry copy", () => {
        const failure = new ApiError("http", 404, "safe_config missing");
        expect(
            replayEntryFailureMessage(
                "metadata",
                new ReplayEntryError(
                    "metadata",
                    "The demo details could not be loaded.",
                    { cause: failure }
                )
            )
        ).toBe("The recorded demo details are missing from this server.");
    });

    it("expires a handoff instead of reusing stale data", () => {
        const entry: ReplayEntry = {
            session: SESSION,
            safeConfig: validConfig(),
            checkpoint: "checkpoint-initial",
            requestId: "request-1",
            createdAt: 1_000,
        };
        stageEntryHandoff(entry);

        expect(peekEntryHandoff(2_000)).toMatchObject({
            requestId: "request-1",
        });
        expect(
            peekEntryHandoff(1_000 + 5 * 60_000 + 1)
        ).toBeNull();
    });

    it("times out a hung acquisition", async () => {
        vi.useFakeTimers();
        const fetchImpl = vi.fn(
            () => new Promise<Response>(() => undefined)
        );

        const pending = loadReplayEntry({ fetchImpl });
        const rejection = expect(pending).rejects.toMatchObject({
            name: "ReplayEntryError",
            stage: "session",
        });
        await vi.advanceTimersByTimeAsync(20_000);

        await rejection;
    });
});
