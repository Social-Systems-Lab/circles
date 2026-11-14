import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
// @ts-expect-error Bun's runtime test module is available even though this repository does not install its types.
import { test } from "bun:test";
import { applyEmailTemplateDefaults } from "../src/lib/data/email";
import {
    POSTMARK_API_URL,
    PostmarkCanaryError,
    PRODUCTION_ORIGIN,
    buildPostmarkCanaryTemplateModel,
    parseCanaryEnvironment,
    runPostmarkVerificationCanary,
    sendPostmarkVerificationCanary,
} from "./postmark-verification-canary.mjs";

const recipient = "postmark-canary@example.invalid";
const sender = "hello@example.invalid";
const token = "sensitive-postmark-token";
const verificationToken = "sensitive-inert-verification-token";
const actionUrl = `${PRODUCTION_ORIGIN}/signup/verify?token=${encodeURIComponent(verificationToken)}`;
const canarySource = readFileSync(
    fileURLToPath(new URL("./postmark-verification-canary.mjs", import.meta.url)),
    "utf8",
);

test("canary source contains no MongoDB or credential-database path", () => {
    assert.doesNotMatch(canarySource, /mongodb|MONGODB_URI|getDb|pendingRegistrations/i);
});

test("canary template model stays aligned with the application email defaults", () => {
    const previousOrigin = process.env.CIRCLES_URL;
    process.env.CIRCLES_URL = PRODUCTION_ORIGIN;
    try {
        assert.deepEqual(
            buildPostmarkCanaryTemplateModel({ actionUrl }),
            applyEmailTemplateDefaults({
                name: "Kamooni Canary",
                actionUrl,
            }),
        );
    } finally {
        if (previousOrigin === undefined) delete process.env.CIRCLES_URL;
        else process.env.CIRCLES_URL = previousOrigin;
    }
});

test("canary sends exactly one Postmark verification-template request", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const result = await sendPostmarkVerificationCanary({
        recipient,
        sender,
        token,
        verificationToken,
        fetchImpl: async (url, init) => {
            calls.push({ url: String(url), init: init ?? {} });
            return new Response(JSON.stringify({ ErrorCode: 0, MessageID: "test-message-id" }), {
                status: 200,
                headers: { "content-type": "application/json" },
            });
        },
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.url, POSTMARK_API_URL);
    assert.equal(calls[0]?.init.redirect, "error");
    assert.ok(calls[0]?.init.signal);
    assert.equal(new Headers(calls[0]?.init.headers).get("X-Postmark-Server-Token"), token);
    const body = JSON.parse(String(calls[0]?.init.body));
    assert.equal(body.From, sender);
    assert.equal(body.To, recipient);
    assert.equal(body.TemplateAlias, "email-verification");
    assert.equal(body.TemplateModel.action_url, actionUrl);
    assert.equal(body.TemplateModel.name, "Kamooni Canary");
    assert.equal(body.MessageStream, undefined);
    assert.deepEqual(result, { accepted: true, template: "email-verification", messageIdPresent: true });
    assert.doesNotMatch(JSON.stringify(result), /sensitive|example\.invalid/);
});

test("CLI canary reads the recipient from stdin and generates the token in memory", async () => {
    let calls = 0;
    const result = await runPostmarkVerificationCanary({
        env: {
            EMAIL_TRANSPORT: "postmark",
            CIRCLES_URL: PRODUCTION_ORIGIN,
            POSTMARK_API_TOKEN: token,
            POSTMARK_SENDER_EMAIL: sender,
        } as unknown as NodeJS.ProcessEnv,
        stdin: Readable.from([recipient]) as unknown as typeof process.stdin,
        fetchImpl: async (_url, init) => {
            calls += 1;
            const body = JSON.parse(String(init?.body));
            const generatedUrl = new URL(body.TemplateModel.action_url);
            assert.equal(generatedUrl.origin, PRODUCTION_ORIGIN);
            assert.equal(generatedUrl.pathname, "/signup/verify");
            assert.ok(generatedUrl.searchParams.get("token"));
            return new Response(JSON.stringify({ ErrorCode: 0, MessageID: "test-message-id" }), { status: 200 });
        },
    });

    assert.equal(calls, 1);
    assert.deepEqual(result, { accepted: true, template: "email-verification", messageIdPresent: true });
});

test("canary rejects invalid runtime configuration before making a request", async () => {
    assert.throws(
        () =>
            parseCanaryEnvironment({
                EMAIL_TRANSPORT: "mailpit",
                CIRCLES_URL: PRODUCTION_ORIGIN,
                POSTMARK_API_TOKEN: token,
                POSTMARK_SENDER_EMAIL: sender,
            }),
        PostmarkCanaryError,
    );
    assert.throws(
        () =>
            parseCanaryEnvironment({
                EMAIL_TRANSPORT: "postmark",
                CIRCLES_URL: PRODUCTION_ORIGIN,
                POSTMARK_API_TOKEN: "",
                POSTMARK_SENDER_EMAIL: sender,
            }),
        PostmarkCanaryError,
    );
    assert.throws(
        () =>
            parseCanaryEnvironment({
                EMAIL_TRANSPORT: "postmark",
                CIRCLES_URL: "https://staging.kamooni.org",
                POSTMARK_API_TOKEN: token,
                POSTMARK_SENDER_EMAIL: sender,
            }),
        PostmarkCanaryError,
    );

    let called = false;
    await assert.rejects(
        sendPostmarkVerificationCanary({
            recipient: "not-an-email",
            sender,
            token,
            verificationToken,
            fetchImpl: async () => {
                called = true;
                throw new Error("must not run");
            },
        }),
        PostmarkCanaryError,
    );
    assert.equal(called, false);
});

test("canary fails closed without retrying or disclosing provider details", async () => {
    for (const response of [
        new Response(JSON.stringify({ ErrorCode: 401, Message: `rejected ${recipient} ${actionUrl}` }), {
            status: 401,
        }),
        new Response(JSON.stringify({ ErrorCode: 300, Message: `rejected ${recipient}` }), { status: 200 }),
        new Response(JSON.stringify({ ErrorCode: 0, MessageID: "" }), { status: 200 }),
    ]) {
        let calls = 0;
        await assert.rejects(
            sendPostmarkVerificationCanary({
                recipient,
                sender,
                token,
                verificationToken,
                fetchImpl: async () => {
                    calls += 1;
                    return response.clone();
                },
            }),
            (error: unknown) => {
                assert.ok(error instanceof PostmarkCanaryError);
                assert.doesNotMatch(error.message, /sensitive|example\.invalid|signup\/verify/);
                return true;
            },
        );
        assert.equal(calls, 1);
    }

    let networkCalls = 0;
    await assert.rejects(
        sendPostmarkVerificationCanary({
            recipient,
            sender,
            token,
            verificationToken,
            fetchImpl: async () => {
                networkCalls += 1;
                throw new Error(`network failed for ${recipient} ${actionUrl}`);
            },
        }),
        (error: unknown) => error instanceof PostmarkCanaryError && error.code === "postmark_request_failed",
    );
    assert.equal(networkCalls, 1);
});
