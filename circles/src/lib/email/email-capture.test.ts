// @ts-expect-error Bun provides its test and mock APIs at runtime; this repository does not install their types.
import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";

const savedEnv = { ...process.env };
process.env.EMAIL_CAPTURE_MODE = "on";
process.env.CIRCLES_URL = "https://staging.kamooni.org";
process.env.POSTMARK_API_TOKEN = "must-never-be-used";
process.env.POSTMARK_SENDER_EMAIL = "sender@example.invalid";
delete process.env.NEXT_PUBLIC_APP_URL;
delete process.env.NEXT_PUBLIC_SITE_URL;

afterAll(() => {
    process.env = savedEnv;
});

let clientConstructions = 0;
let postmarkSends = 0;
mock.module("postmark", () => ({
    ServerClient: class {
        constructor() {
            clientConstructions += 1;
        }
        async sendEmailWithTemplate() {
            postmarkSends += 1;
            return { MessageID: "sent" };
        }
    },
    TemplatedMessage: class {},
}));

const captured: Array<{ to: string; templateAlias: string; templateModel: Record<string, unknown> }> = [];
let failStorage = false;
mock.module("@/lib/email/captured-emails", () => ({
    storeCapturedEmail: async (email: (typeof captured)[number]) => {
        if (failStorage) throw new Error("database failed for secret@example.test token=top-secret");
        captured.push(email);
        return "captured-id";
    },
}));

const { sendEmail } = await import("@/lib/data/email");

const mail = {
    to: "secret@example.test",
    templateAlias: "email-verification",
    templateModel: { actionUrl: "https://staging.kamooni.org/verify-email?token=top-secret" },
};

const captureLogs = async (run: () => Promise<void>) => {
    const lines: string[] = [];
    const originals = { log: console.log, error: console.error };
    console.log = (...args: unknown[]) => lines.push(args.map(String).join(" "));
    console.error = (...args: unknown[]) => lines.push(args.map(String).join(" "));
    try {
        await run();
    } finally {
        Object.assign(console, originals);
    }
    return lines.join("\n");
};

describe("central email capture", () => {
    beforeEach(() => {
        captured.length = 0;
        failStorage = false;
        postmarkSends = 0;
    });

    test("captures the finalized template and never constructs or calls Postmark", async () => {
        await sendEmail(mail);
        expect(clientConstructions).toBe(0);
        expect(postmarkSends).toBe(0);
        expect(captured).toHaveLength(1);
        expect(captured[0].to).toBe(mail.to);
        expect(captured[0].templateModel.action_url).toBe(mail.templateModel.actionUrl);
        expect(captured[0].templateModel.product_name).toBe("Kamooni");
    });

    test("storage failure never falls back to delivery and logs no sensitive data", async () => {
        failStorage = true;
        const output = await captureLogs(async () => {
            await expect(sendEmail(mail)).rejects.toThrow("Failed to capture email.");
        });
        expect(postmarkSends).toBe(0);
        for (const secret of [mail.to, "top-secret", "token=", "/verify-email", "database failed"]) {
            expect(output).not.toContain(secret);
        }
    });

    test("successful capture logs neither recipient nor token", async () => {
        const output = await captureLogs(() => sendEmail(mail));
        expect(output).toContain("Email captured using template email-verification.");
        expect(output).not.toContain(mail.to);
        expect(output).not.toContain("top-secret");
    });
});
