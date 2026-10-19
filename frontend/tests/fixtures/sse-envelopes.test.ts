/**
 * Executes the SSE wire fixtures against the real stream envelope decoder
 * (spec-03 contract, decoded from shared api since spec-05).
 *
 * Fixtures must stay executable evidence of the backend_to_frontend_events
 * contract: each envelope is byte-exact backend wire format, and these tests
 * prove they are delivered safely at the transport boundary — splitting,
 * duplicate delivery, EOF-without-terminal, and same-name tool calls.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { decodeSseEvents, StreamEvent } from "@/shared/api/sse";
import {
    DUPLICATE_REPLAY,
    DUPLICATE_TOOL_NAMES,
    EOF_WITHOUT_TERMINAL,
    SPLIT_TEXT_THEN_DONE,
    makeSseResponse,
} from "./sse";
import { createScriptedFetch } from "./transport";

async function streamWith(chunks: string[]): Promise<StreamEvent[]> {
    const events: StreamEvent[] = [];
    for await (const event of decodeSseEvents(makeSseResponse(chunks))) {
        events.push(event);
    }
    return events;
}

describe("SSE wire envelopes", () => {
    it("delivers a stream cut mid-JSON and mid-frame intact", async () => {
        const events = await streamWith(SPLIT_TEXT_THEN_DONE);

        expect(events.map((event) => event.type)).toEqual(["text", "text", "done"]);
        expect(events[0]?.content).toBe("hel");
        expect(events[1]?.content).toBe("loe");
        expect(events[2]?.message_id).toBe("msg-fixed-1");
        expect(events[2]?.usage).toEqual({ prompt_tokens: 3, completion_tokens: 2 });
    });

    it("passes duplicate/replay delivery through to the consumer", async () => {
        const events = await streamWith(DUPLICATE_REPLAY);

        // The parser is transport-passthrough: it forwards what arrived in
        // order. Replay dedupe is an application concern, not a parser rule.
        expect(events.map((event) => event.type)).toEqual(["text", "text", "done"]);
        expect(events[0]?.content).toBe("dial");
        expect(events[1]?.content).toBe("dial");
    });

    it("surfaces EOF-without-terminal as the interrupted error", async () => {
        const events = await streamWith(EOF_WITHOUT_TERMINAL);

        expect(events.map((event) => event.type)).toEqual(["text", "error"]);
        expect(events[1]?.interrupted).toBe(true);
        expect(events[1]?.content).toMatch(/interrupted/i);
    });

    it("keeps same-name tool calls distinct by call id", async () => {
        const events = await streamWith(DUPLICATE_TOOL_NAMES);

        expect(events.map((event) => event.type)).toEqual([
            "tool_call",
            "tool_call",
            "tool_result",
            "tool_result",
            "done",
        ]);
        expect(
            events
                .filter((event) => event.type === "tool_call")
                .map((event) => (event as { tool_call_id?: string }).tool_call_id)
        ).toEqual(["call-first-1", "call-second-2"]);
        expect(
            events
                .filter((event) => event.type === "tool_result")
                .map((event) => (event as { tool_result?: string }).tool_result)
        ).toEqual(["result for first", "result for second"]);
    });

    it("groups envelope semantics under one wire contract", () => {
        // Meta-protection so fixtures stay non-vacuous: envelopes are real
        // touches of the documented wire format, not empty lists.
        for (const envelope of [SPLIT_TEXT_THEN_DONE, DUPLICATE_REPLAY, EOF_WITHOUT_TERMINAL, DUPLICATE_TOOL_NAMES]) {
            expect(envelope.length).toBeGreaterThan(0);
            for (const chunk of envelope) {
                expect(chunk.length).toBeGreaterThan(0);
            }
        }
    });
});

describe("ScriptedFetch transport fake", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it("rejects queued failures then serves queued json, recording every call", async () => {
        const fetcher = createScriptedFetch();
        fetcher.enqueueFailure(new Error("connection refused"));
        fetcher.enqueueJson(200, { message: "Sabha API" });
        fetcher.install();

        await expect(fetch("first", { method: "POST", body: "x" })).rejects.toThrow("connection refused");
        await expect(fetch("second", { method: "GET" })).resolves.toMatchObject({ status: 200 });

        expect(fetcher.calls.map((call) => call.input)).toEqual(["first", "second"]);
        expect(fetcher.calls.map((call) => call.init?.method)).toEqual(["POST", "GET"]);
        fetcher.reset();
    });

    it("fails loudly when a call runs with an empty queue", async () => {
        const fetcher = createScriptedFetch();
        fetcher.install();

        await expect(fetch("none")).rejects.toThrow("no queued outcome");

        fetcher.reset();
    });
});
