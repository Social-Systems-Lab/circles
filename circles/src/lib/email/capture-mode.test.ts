// @ts-expect-error Bun provides its test APIs at runtime; this repository does not install their types.
import { describe, expect, test } from "bun:test";
import { checkEmailCaptureMode, enforceEmailCaptureModeAtBoot, isEmailCaptureOn } from "./capture-mode";

const STAGING = "https://staging.kamooni.org";

describe("email capture mode", () => {
    test("is off only for an empty, missing, or explicit off setting", () => {
        for (const value of [undefined, "", "off"]) {
            expect(checkEmailCaptureMode({ EMAIL_CAPTURE_MODE: value, CIRCLES_URL: "https://kamooni.org" })).toEqual({
                mode: "off",
            });
        }
    });

    test("refuses missing or disabled capture mode on staging", () => {
        for (const value of [undefined, "", "off"]) {
            expect(checkEmailCaptureMode({ EMAIL_CAPTURE_MODE: value, CIRCLES_URL: STAGING }).mode).toBe("refused");
        }
    });

    test("allows exact staging and local hosts", () => {
        for (const url of [STAGING, `${STAGING}/path`, "http://localhost:3000", "http://127.0.0.1:3000"]) {
            expect(checkEmailCaptureMode({ EMAIL_CAPTURE_MODE: "on", CIRCLES_URL: url })).toEqual({ mode: "on" });
        }
    });

    test("refuses production, lookalike hosts, missing URLs, invalid URLs, conflicting URLs, and typos", () => {
        const refused = [
            { EMAIL_CAPTURE_MODE: "on" },
            { EMAIL_CAPTURE_MODE: "on", CIRCLES_URL: "https://kamooni.org" },
            { EMAIL_CAPTURE_MODE: "on", CIRCLES_URL: "https://staging.kamooni.org.evil.test" },
            { EMAIL_CAPTURE_MODE: "on", CIRCLES_URL: "not-a-url" },
            { EMAIL_CAPTURE_MODE: "true", CIRCLES_URL: STAGING },
            { EMAIL_CAPTURE_MODE: "on", CIRCLES_URL: STAGING, NEXT_PUBLIC_SITE_URL: "https://kamooni.org" },
        ];
        for (const env of refused) expect(checkEmailCaptureMode(env).mode).toBe("refused");
    });

    test("boot validation exits for a refused setting and never for off", () => {
        const exits: number[] = [];
        enforceEmailCaptureModeAtBoot({ EMAIL_CAPTURE_MODE: "on", CIRCLES_URL: "https://kamooni.org" }, (code) =>
            exits.push(code),
        );
        expect(exits).toEqual([1]);
        expect(isEmailCaptureOn({ EMAIL_CAPTURE_MODE: "on", CIRCLES_URL: STAGING })).toBe(true);
        expect(isEmailCaptureOn({ CIRCLES_URL: "https://kamooni.org" })).toBe(false);
    });
});
