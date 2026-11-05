import { describe, expect, it } from "vitest";

import { readableTextOn } from "./readable-color";

describe("readableTextOn", () => {
    it("uses dark ink on bright participant colors", () => {
        expect(readableTextOn("#f59e0b")).toBe("#0b1423");
        expect(readableTextOn("#34d399")).toBe("#0b1423");
        expect(readableTextOn("#fff")).toBe("#0b1423");
    });

    it("uses white on dark participant colors", () => {
        expect(readableTextOn("#2563eb")).toBe("#ffffff");
        expect(readableTextOn("#000000")).toBe("#ffffff");
    });

    it("falls back to white for malformed input", () => {
        expect(readableTextOn("not-a-color")).toBe("#ffffff");
    });
});
