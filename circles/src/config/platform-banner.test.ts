import { describe, expect, test } from "bun:test";
import {
    DEFAULT_WELCOME_BANNER_TEXT,
    PLATFORM_BANNER_TYPES,
    WELCOME_BANNER_KEY,
} from "./platform-banner";

describe("platform banner config", () => {
    test("uses a stable key for the welcome banner", () => {
        expect(WELCOME_BANNER_KEY).toBe("welcome_banner");
    });

    test("supports alert, announcement and cta banner types", () => {
        expect([...PLATFORM_BANNER_TYPES]).toEqual(["alert", "announcement", "cta"]);
    });

    test("ships a non-empty default welcome text", () => {
        expect(DEFAULT_WELCOME_BANNER_TEXT.trim().length).toBeGreaterThan(0);
        expect(DEFAULT_WELCOME_BANNER_TEXT).toBe(DEFAULT_WELCOME_BANNER_TEXT.trim());
    });
});
