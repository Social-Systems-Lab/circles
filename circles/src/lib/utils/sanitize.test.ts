import { describe, expect, test } from "bun:test";
import { sanitizeObjectForJSON } from "./sanitize";

describe("sanitizeObjectForJSON", () => {
    test("passes null and undefined through", () => {
        expect(sanitizeObjectForJSON(null)).toBeNull();
        expect(sanitizeObjectForJSON(undefined)).toBeUndefined();
    });

    test("leaves integers, strings and booleans untouched", () => {
        expect(sanitizeObjectForJSON(42)).toBe(42);
        expect(sanitizeObjectForJSON(0)).toBe(0);
        expect(sanitizeObjectForJSON(-7)).toBe(-7);
        expect(sanitizeObjectForJSON("text")).toBe("text");
        expect(sanitizeObjectForJSON(true)).toBe(true);
    });

    test("converts non-integer numbers to strings", () => {
        expect(sanitizeObjectForJSON(1.5)).toBe("1.5");
        expect(sanitizeObjectForJSON(-0.25)).toBe("-0.25");
    });

    test("converts NaN and infinities to strings", () => {
        expect(sanitizeObjectForJSON(Number.NaN)).toBe("NaN");
        expect(sanitizeObjectForJSON(Number.POSITIVE_INFINITY)).toBe("Infinity");
    });

    test("sanitizes array elements recursively", () => {
        expect(sanitizeObjectForJSON([1, 2.5, "x", [3.5]])).toEqual([1, "2.5", "x", ["3.5"]]);
    });

    test("sanitizes object values recursively", () => {
        expect(sanitizeObjectForJSON({ a: 1.5, b: { c: 2.5, d: [0.1] }, e: "keep" })).toEqual({
            a: "1.5",
            b: { c: "2.5", d: ["0.1"] },
            e: "keep",
        });
    });

    test("returns copies rather than the original containers", () => {
        const input = { list: [1], nested: { n: 1 } };
        const output = sanitizeObjectForJSON(input);
        expect(output).toEqual(input);
        expect(output).not.toBe(input);
        expect(output.list).not.toBe(input.list);
        expect(output.nested).not.toBe(input.nested);
    });

    test("does not mutate its input", () => {
        const input = { a: 1.5, list: [2.5] };
        sanitizeObjectForJSON(input);
        expect(input).toEqual({ a: 1.5, list: [2.5] });
    });

    test("preserves null and undefined nested values", () => {
        const output = sanitizeObjectForJSON({ a: null, b: undefined });
        expect(output).toEqual({ a: null, b: undefined });
        expect("b" in output).toBe(true);
    });

    test("ignores inherited properties", () => {
        const parent = { inherited: 1.5 };
        const child = Object.create(parent);
        child.own = 2.5;
        expect(sanitizeObjectForJSON(child)).toEqual({ own: "2.5" });
    });

    test("turns Date instances into empty objects because they have no own enumerable keys", () => {
        expect(sanitizeObjectForJSON(new Date())).toEqual({});
    });

    test("handles empty containers", () => {
        expect(sanitizeObjectForJSON([])).toEqual([]);
        expect(sanitizeObjectForJSON({})).toEqual({});
    });
});
