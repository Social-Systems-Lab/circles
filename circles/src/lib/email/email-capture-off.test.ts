// @ts-expect-error Bun provides its test and mock APIs at runtime; this repository does not install their types.
import { afterAll, expect, mock, test } from "bun:test";

const savedEnv = { ...process.env };
process.env.EMAIL_CAPTURE_MODE = "off";
process.env.CIRCLES_URL = "https://kamooni.org";
process.env.POSTMARK_API_TOKEN = "production-token";
process.env.POSTMARK_SENDER_EMAIL = "sender@example.test";

afterAll(() => {
    process.env = savedEnv;
});

const sends: unknown[] = [];
let clientConstructions = 0;
class FakeMessage {
    constructor(
        readonly from: string,
        readonly templateAlias: string,
        readonly templateModel: Record<string, unknown>,
        readonly to: string,
    ) {}
}
mock.module("postmark", () => ({
    ServerClient: class {
        constructor() {
            clientConstructions += 1;
        }
        async sendEmailWithTemplate(message: unknown) {
            sends.push(message);
            return { MessageID: "production-message" };
        }
    },
    TemplatedMessage: FakeMessage,
}));

let captureStoreLoaded = false;
mock.module("@/lib/email/captured-emails", () => {
    captureStoreLoaded = true;
    return { storeCapturedEmail: async () => "must-not-run" };
});

const { sendEmail } = await import("@/lib/data/email");

test("capture mode off preserves the existing Postmark send and Promise<void> contract", async () => {
    const result = await sendEmail({
        to: "recipient@example.test",
        templateAlias: "email-verification",
        templateModel: { actionUrl: "https://kamooni.org/verify-email?token=production" },
    });
    expect(result).toBeUndefined();
    expect(clientConstructions).toBe(1);
    expect(sends).toHaveLength(1);
    expect((sends[0] as FakeMessage).to).toBe("recipient@example.test");
    expect(captureStoreLoaded).toBe(false);
});
