import assert from "node:assert/strict";
// @ts-expect-error Bun provides test and module-mocking APIs at runtime; Bun types are not installed.
import { afterAll, mock, test } from "bun:test";

type CapturedTemplateMessage = {
    from: string;
    templateAlias: string;
    templateModel: Record<string, unknown>;
    to: string;
};

const originalToken = process.env.POSTMARK_API_TOKEN;
const originalSender = process.env.POSTMARK_SENDER_EMAIL;
process.env.POSTMARK_API_TOKEN = "postmark-test-token";
process.env.POSTMARK_SENDER_EMAIL = "test-sender@example.invalid";

let constructedClientToken: string | undefined;
const constructedMessages: CapturedTemplateMessage[] = [];
let sendFailure: Error | undefined;

class MockTemplatedMessage implements CapturedTemplateMessage {
    constructor(
        public from: string,
        public templateAlias: string,
        public templateModel: Record<string, unknown>,
        public to: string,
    ) {}
}

class MockServerClient {
    constructor(token: string) {
        constructedClientToken = token;
    }

    async sendEmailWithTemplate(message: CapturedTemplateMessage) {
        constructedMessages.push(message);
        if (sendFailure) throw sendFailure;
        return { MessageID: "disposable-postmark-test-message" };
    }
}

mock.module("postmark", () => ({
    ServerClient: MockServerClient,
    TemplatedMessage: MockTemplatedMessage,
}));

const { sendEmail } = await import("./email");

test("sendEmail constructs and sends a Postmark templated message", async () => {
    constructedMessages.length = 0;
    sendFailure = undefined;

    await sendEmail({
        to: "member@example.invalid",
        templateAlias: "welcome",
        templateModel: { name: "Member", actionUrl: "https://kamooni.example/verify" },
    });

    assert.equal(constructedClientToken, "postmark-test-token");
    const actual = constructedMessages[0];
    assert.ok(actual);
    assert.equal(actual.from, "test-sender@example.invalid");
    assert.equal(actual.templateAlias, "welcome");
    assert.equal(actual.to, "member@example.invalid");
    assert.equal(actual.templateModel.name, "Member");
    assert.equal(actual.templateModel.action_url, "https://kamooni.example/verify");
    assert.equal(actual.templateModel.product_name, "Kamooni");
});

test("sendEmail wraps provider failures without changing successful call semantics", async () => {
    sendFailure = new Error("provider unavailable");

    await assert.rejects(sendEmail({ to: "member@example.invalid", templateAlias: "verify", templateModel: {} }), {
        message: "Failed to send email: provider unavailable",
    });

    sendFailure = undefined;
});

afterAll(() => {
    if (originalToken === undefined) delete process.env.POSTMARK_API_TOKEN;
    else process.env.POSTMARK_API_TOKEN = originalToken;
    if (originalSender === undefined) delete process.env.POSTMARK_SENDER_EMAIL;
    else process.env.POSTMARK_SENDER_EMAIL = originalSender;
});
