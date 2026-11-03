import assert from "node:assert/strict";
// @ts-expect-error Bun provides test at runtime; Bun types are not installed.
import { test } from "bun:test";
import {
    EmailDeliveryError,
    resolveEmailTransportConfiguration,
    sendEmailWithDependencies,
    type EmailOptions,
    type EmailSenderDependencies,
} from "./email";

const token = "verification-token+/?=";
const verificationUrl = `https://staging.kamooni.org/signup/verify?token=${encodeURIComponent(token)}`;
const emailOptions: EmailOptions = {
    to: "test-member@example.invalid",
    templateAlias: "email-verification",
    templateModel: { name: "Test Member", actionUrl: verificationUrl },
};

function harness(
    role: EmailSenderDependencies["role"],
    env: Record<string, string | undefined>,
    overrides: Partial<EmailSenderDependencies> = {},
) {
    const calls = { postmark: 0, mailpit: 0 };
    const captured: unknown[] = [];
    const logs: Array<{ event: string; details: Record<string, string> }> = [];
    const dependencies: EmailSenderDependencies = {
        role,
        env,
        sendPostmark: async (configuration, options) => {
            calls.postmark += 1;
            captured.push({ configuration, options });
            return { MessageID: "test-message-id" };
        },
        sendMailpit: async (configuration, message) => {
            calls.mailpit += 1;
            captured.push({ configuration, message });
            return { messageId: "test-mailpit-message-id" };
        },
        logError: (event, details) => logs.push({ event, details }),
        ...overrides,
    };
    return { dependencies, calls, captured, logs };
}

const stagingConfig = {
    EMAIL_TRANSPORT: "mailpit",
    MAILPIT_SMTP_HOST: "mailpit",
    MAILPIT_SMTP_PORT: "1025",
    POSTMARK_API_TOKEN: "",
    POSTMARK_SENDER_EMAIL: "",
    CIRCLES_URL: "https://staging.kamooni.org",
};

test("production Postmark transport preserves templated-message dispatch", async () => {
    const testHarness = harness("production", {
        EMAIL_TRANSPORT: "postmark",
        POSTMARK_API_TOKEN: "test-postmark-token",
        POSTMARK_SENDER_EMAIL: "sender@example.invalid",
    });

    await sendEmailWithDependencies(emailOptions, testHarness.dependencies);

    assert.equal(testHarness.calls.postmark, 1);
    assert.equal(testHarness.calls.mailpit, 0);
    assert.equal(testHarness.logs.length, 0);
});

test("Postmark delivery failures reject with a sanitized error and log no message secrets", async () => {
    const testHarness = harness(
        "production",
        {
            EMAIL_TRANSPORT: "postmark",
            POSTMARK_API_TOKEN: "test-postmark-token",
            POSTMARK_SENDER_EMAIL: "sender@example.invalid",
        },
        {
            sendPostmark: async () => {
                throw Object.assign(new Error(`failed ${verificationUrl} for ${emailOptions.to}`), {
                    code: "ECONNRESET",
                });
            },
        },
    );

    await assert.rejects(sendEmailWithDependencies(emailOptions, testHarness.dependencies), EmailDeliveryError);

    const logged = JSON.stringify(testHarness.logs);
    assert.equal(testHarness.logs[0]?.details.error, "ECONNRESET");
    assert.doesNotMatch(logged, /verification-token|staging\.kamooni|test-member|example\.invalid/);
});

test("Mailpit captures the pending verification link without changing its encoded token", async () => {
    const testHarness = harness("staging", stagingConfig);

    await sendEmailWithDependencies(emailOptions, testHarness.dependencies);

    assert.equal(testHarness.calls.mailpit, 1);
    assert.equal(testHarness.calls.postmark, 0);
    const captured = testHarness.captured[0] as { message: { text: string; html: string; to: string } };
    assert.equal(captured.message.to, emailOptions.to);
    assert.ok(captured.message.text.includes(verificationUrl));
    assert.ok(captured.message.html.includes(verificationUrl.replaceAll("&", "&amp;")));
    assert.equal(testHarness.logs.length, 0);
});

test("Mailpit rejects unsupported templates and routes without sending", async () => {
    const testHarness = harness("staging", stagingConfig);
    const unsupported = { ...emailOptions, templateAlias: "password-reset" };

    await assert.rejects(sendEmailWithDependencies(unsupported, testHarness.dependencies), EmailDeliveryError);
    assert.equal(testHarness.calls.mailpit, 0);
    assert.equal(testHarness.calls.postmark, 0);

    const externalUrl = { ...emailOptions, templateModel: { actionUrl: "https://evil.example/signup/verify?token=x" } };
    await assert.rejects(sendEmailWithDependencies(externalUrl, testHarness.dependencies), EmailDeliveryError);
    assert.equal(testHarness.calls.mailpit, 0);

    const wrongPath = {
        ...emailOptions,
        templateModel: { actionUrl: `https://staging.kamooni.org/register/verify?token=${encodeURIComponent(token)}` },
    };
    await assert.rejects(sendEmailWithDependencies(wrongPath, testHarness.dependencies), EmailDeliveryError);
    assert.equal(testHarness.calls.mailpit, 0);
});

test("Mailpit supports the existing account verification route without enabling other templates", async () => {
    const testHarness = harness("staging", stagingConfig);
    const legacyVerification = {
        ...emailOptions,
        templateModel: {
            name: "Existing Member",
            actionUrl: "https://staging.kamooni.org/verify-email?token=legacy-token",
        },
    };

    await sendEmailWithDependencies(legacyVerification, testHarness.dependencies);
    assert.equal(testHarness.calls.mailpit, 1);
    assert.equal(testHarness.calls.postmark, 0);
});

test("missing or invalid transport configuration fails closed", async () => {
    for (const [role, env] of [
        ["development", {}],
        ["production", { EMAIL_TRANSPORT: "mailpit", POSTMARK_API_TOKEN: "x", POSTMARK_SENDER_EMAIL: "x" }],
        [
            "staging",
            { ...stagingConfig, EMAIL_TRANSPORT: "postmark", POSTMARK_API_TOKEN: "", POSTMARK_SENDER_EMAIL: "" },
        ],
        ["staging", { ...stagingConfig, POSTMARK_API_TOKEN: "accidental-secret" }],
        ["staging", { ...stagingConfig, MAILPIT_SMTP_HOST: "smtp.external.example" }],
        ["staging", { ...stagingConfig, CIRCLES_URL: "https://kamooni.org" }],
    ] as Array<[EmailSenderDependencies["role"], Record<string, string | undefined>]>) {
        assert.throws(() => resolveEmailTransportConfiguration(role, env), EmailDeliveryError);
        const testHarness = harness(role, env);
        await assert.rejects(sendEmailWithDependencies(emailOptions, testHarness.dependencies), EmailDeliveryError);
        assert.equal(testHarness.calls.postmark, 0);
        assert.equal(testHarness.calls.mailpit, 0);
    }
});

test("production requires both Postmark credentials and never accepts Mailpit", () => {
    for (const env of [
        { EMAIL_TRANSPORT: "postmark", POSTMARK_SENDER_EMAIL: "sender@example.invalid" },
        { EMAIL_TRANSPORT: "postmark", POSTMARK_API_TOKEN: "test-postmark-token" },
        {
            EMAIL_TRANSPORT: "mailpit",
            POSTMARK_API_TOKEN: "test-postmark-token",
            POSTMARK_SENDER_EMAIL: "sender@example.invalid",
        },
    ]) {
        assert.throws(() => resolveEmailTransportConfiguration("production", env), EmailDeliveryError);
    }
});

test("unavailable SMTP rejects and never falls back to Postmark", async () => {
    const testHarness = harness("staging", stagingConfig, {
        sendMailpit: async () => {
            throw Object.assign(new Error(`socket failure ${verificationUrl}`), { code: "ECONNREFUSED" });
        },
    });

    await assert.rejects(sendEmailWithDependencies(emailOptions, testHarness.dependencies), EmailDeliveryError);

    assert.equal(testHarness.calls.postmark, 0);
    const logged = JSON.stringify(testHarness.logs);
    assert.equal(testHarness.logs[0]?.details.error, "ECONNREFUSED");
    assert.doesNotMatch(logged, /verification-token|staging\.kamooni|test-member/);
});

test("local development requires explicit loopback Mailpit configuration", () => {
    assert.throws(() => resolveEmailTransportConfiguration("development", {}), EmailDeliveryError);
    assert.throws(
        () =>
            resolveEmailTransportConfiguration("development", {
                EMAIL_TRANSPORT: "mailpit",
                MAILPIT_SMTP_HOST: "smtp.example.com",
                MAILPIT_SMTP_PORT: "25",
                CIRCLES_URL: "https://kamooni.org",
            }),
        EmailDeliveryError,
    );
    assert.doesNotThrow(() =>
        resolveEmailTransportConfiguration("development", {
            EMAIL_TRANSPORT: "mailpit",
            MAILPIT_SMTP_HOST: "127.0.0.1",
            MAILPIT_SMTP_PORT: "1025",
            CIRCLES_URL: "http://localhost:3000",
        }),
    );
});
