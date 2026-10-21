// @ts-expect-error Bun provides its test and mock APIs at runtime; this repository does not install their types.
import { afterAll, describe, expect, mock, test } from "bun:test";

const savedEnv = { ...process.env };
process.env.EMAIL_CAPTURE_MODE = "on";
process.env.CIRCLES_URL = "https://staging.kamooni.org";
afterAll(() => {
    process.env = savedEnv;
});

let authorized = false;
mock.module("@/lib/auth/superadmin", () => ({
    requireSuperAdmin: async () => {
        if (!authorized) throw new Error("unauthorized");
        return "did:superadmin";
    },
}));
mock.module("./captured-emails", () => ({
    listCapturedEmails: async () => [
        {
            _id: "id-1",
            to: "recipient@example.test",
            templateAlias: "email-verification",
            createdAt: new Date("2026-10-21T10:00:00Z"),
            templateModel: {
                action_url: "https://staging.kamooni.org/verify-email?token=secret",
                production: "https://kamooni.org/verify-email?token=secret",
                lookalike: "https://staging.kamooni.org.evil.test/steal",
                local: "http://localhost:3000/verify-email?token=local",
            },
        },
    ],
}));

const { linksInModel, loadCapturedEmailsPage } = await import("./captured-emails-admin");

describe("captured email administration", () => {
    test("returns not found when capture mode is off", async () => {
        process.env.EMAIL_CAPTURE_MODE = "off";
        authorized = true;
        expect(await loadCapturedEmailsPage()).toEqual({ status: "not_found" });
        process.env.EMAIL_CAPTURE_MODE = "on";
    });

    test("returns not found without superadmin authorization", async () => {
        authorized = false;
        expect(await loadCapturedEmailsPage()).toEqual({ status: "not_found" });
    });

    test("returns captured data to a superadmin", async () => {
        authorized = true;
        const result = await loadCapturedEmailsPage();
        expect(result.status).toBe("ok");
        if (result.status === "ok") expect(result.emails[0].to).toBe("recipient@example.test");
    });

    test("only exact approved hosts become clickable links", () => {
        expect(
            linksInModel({
                action_url: "https://staging.kamooni.org/verify-email?token=secret",
                production: "https://kamooni.org/reset-password?token=secret",
                lookalike: "https://staging.kamooni.org.evil.test/steal",
                javascript: "javascript:alert(1)",
                local: "http://127.0.0.1:3000/verify-email?token=local",
            }),
        ).toEqual([
            "https://staging.kamooni.org/verify-email?token=secret",
            "http://127.0.0.1:3000/verify-email?token=local",
        ]);
    });
});
