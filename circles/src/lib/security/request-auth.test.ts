import { describe, expect, test } from "bun:test";
import { hasValidBearerToken, timingSafeEqualString } from "./request-auth";

describe("request auth helpers", () => {
    test("accepts only matching bearer tokens", () => {
        expect(hasValidBearerToken("Bearer cron-secret", "cron-secret")).toBe(true);
        expect(hasValidBearerToken("bearer cron-secret", "cron-secret")).toBe(true);
        expect(hasValidBearerToken("Bearer wrong-secret", "cron-secret")).toBe(false);
        expect(hasValidBearerToken("Basic cron-secret", "cron-secret")).toBe(false);
        expect(hasValidBearerToken(null, "cron-secret")).toBe(false);
        expect(hasValidBearerToken("Bearer cron-secret", undefined)).toBe(false);
    });

    test("does not treat empty or different-length strings as valid", () => {
        expect(timingSafeEqualString("", "")).toBe(false);
        expect(timingSafeEqualString("abc", "abcd")).toBe(false);
        expect(timingSafeEqualString("abc", "abc")).toBe(true);
    });
});
