import { describe, expect, test } from "bun:test";
import { generateColorFromString } from "./color";

describe("generateColorFromString", () => {
    test("returns a lowercase 7-character hex color", () => {
        expect(generateColorFromString("kamooni")).toMatch(/^#[0-9a-f]{6}$/);
    });

    test("is deterministic for the same input", () => {
        expect(generateColorFromString("circle")).toBe(generateColorFromString("circle"));
    });

    test("returns different colors for different inputs", () => {
        expect(generateColorFromString("alice")).not.toBe(generateColorFromString("bob"));
    });

    test("returns black for the empty string", () => {
        expect(generateColorFromString("")).toBe("#000000");
    });

    test("derives the channels from the low bytes of the 32-bit hash", () => {
        // "a" hashes to 97 (0x61): only the lowest byte is set. Channels are emitted low byte first.
        expect(generateColorFromString("a")).toBe("#610000");
        // "ab": hash = 98 + ((97 << 5) - 97) = 3105 (0x0c21)
        expect(generateColorFromString("ab")).toBe("#210c00");
    });

    test("handles negative hashes by using the sign-extended bytes", () => {
        const color = generateColorFromString("a much longer string that overflows the 32-bit hash range");
        expect(color).toMatch(/^#[0-9a-f]{6}$/);
    });

    test("handles non-ASCII characters", () => {
        expect(generateColorFromString("åäö😀")).toMatch(/^#[0-9a-f]{6}$/);
    });
});
