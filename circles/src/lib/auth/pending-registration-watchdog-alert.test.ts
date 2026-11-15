import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
// @ts-expect-error Bun's runtime test module is available even though this repository does not install its types.
import { test } from "bun:test";
import { applyEmailTemplateDefaults } from "@/lib/data/email";
import {
    buildWatchdogAlertCanaryRequest,
    buildWatchdogAlertTemplateModel,
    runWatchdogAlertCanary,
    sendWatchdogAlertCanary,
    WatchdogAlertCanaryError,
    WATCHDOG_ALERT_PRODUCTION_ORIGIN,
    WATCHDOG_ALERT_TEMPLATE_ALIAS,
} from "./pending-registration-watchdog-alert.mjs";

const recipient = "watchdog-alert-canary@example.invalid";
const sender = "hello@example.invalid";
const token = "sensitive-postmark-token";
const canaryInput = [WATCHDOG_ALERT_PRODUCTION_ORIGIN, "postmark", token, sender, recipient].join("\n");
const alertSource = readFileSync(
    fileURLToPath(new URL("./pending-registration-watchdog-alert.mjs", import.meta.url)),
    "utf8",
);

test("watchdog alert canary has no database, volume or registration mutation path", () => {
    assert.doesNotMatch(alertSource, /MONGODB_URI|getDb|pendingRegistrations|registrationRouting|minio/i);
    assert.doesNotMatch(alertSource, /REGISTRATION_ROUTING_OPERATOR_TOKEN|PENDING_REGISTRATION_TOKEN_HMAC_KEY/);
});

test("watchdog alert template model is fully defaulted and sanitized", () => {
    const previousOrigin = process.env.CIRCLES_URL;
    process.env.CIRCLES_URL = WATCHDOG_ALERT_PRODUCTION_ORIGIN;
    try {
        const model = buildWatchdogAlertTemplateModel({
            level: "critical",
            reasons: ["manual_review_required", "private@example.invalid", "persistent_active_lock"],
            pauseResult: "paused",
        });
        assert.deepEqual(applyEmailTemplateDefaults(model), model);
        assert.deepEqual(model.notifications, [
            "Onboarding watchdog status: critical",
            "Signals: manual_review_required, persistent_active_lock",
            "Automatic pause: paused",
        ]);
        assert.doesNotMatch(JSON.stringify(model), /private@example\.invalid|sensitive-postmark-token/);
    } finally {
        if (previousOrigin === undefined) delete process.env.CIRCLES_URL;
        else process.env.CIRCLES_URL = previousOrigin;
    }
});

test("watchdog alert canary sends exactly one notification-reminder request", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const result = await runWatchdogAlertCanary({
        stdin: Readable.from([canaryInput]) as unknown as typeof process.stdin,
        fetchImpl: async (url, init) => {
            calls.push({ url: String(url), init: init ?? {} });
            return new Response(JSON.stringify({ ErrorCode: 0, MessageID: "canary-message-id" }), {
                status: 200,
                headers: { "content-type": "application/json" },
            });
        },
        now: new Date("2026-11-15T12:00:00.000Z"),
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.url, "https://api.postmarkapp.com/email/withTemplate");
    assert.equal(calls[0]?.init.redirect, "error");
    assert.ok(calls[0]?.init.signal);
    assert.equal(new Headers(calls[0]?.init.headers).get("X-Postmark-Server-Token"), token);
    const body = JSON.parse(String(calls[0]?.init.body));
    assert.equal(body.From, sender);
    assert.equal(body.To, recipient);
    assert.equal(body.TemplateAlias, WATCHDOG_ALERT_TEMPLATE_ALIAS);
    assert.deepEqual(body.TemplateModel.notifications, [
        "Onboarding watchdog status: warning",
        "Signals: watchdog_canary",
        "Automatic pause: not_requested",
    ]);
    assert.deepEqual(result, {
        accepted: true,
        template: WATCHDOG_ALERT_TEMPLATE_ALIAS,
        messageIdPresent: true,
    });
    assert.doesNotMatch(JSON.stringify(result), /sensitive|example\.invalid/);
});

test("watchdog alert canary rejects invalid input before any network request", async () => {
    let called = false;
    await assert.rejects(
        runWatchdogAlertCanary({
            stdin: Readable.from([
                "https://staging.kamooni.org\npostmark\ntoken\nsender@example.invalid\nrecipient@example.invalid",
            ]) as unknown as typeof process.stdin,
            fetchImpl: async () => {
                called = true;
                throw new Error("must not run");
            },
        }),
        WatchdogAlertCanaryError,
    );
    assert.equal(called, false);

    assert.throws(
        () =>
            buildWatchdogAlertCanaryRequest({
                origin: WATCHDOG_ALERT_PRODUCTION_ORIGIN,
                transport: "mailpit",
                token,
                sender,
                recipient,
            }),
        WatchdogAlertCanaryError,
    );
    assert.throws(
        () =>
            buildWatchdogAlertCanaryRequest({
                origin: WATCHDOG_ALERT_PRODUCTION_ORIGIN,
                transport: "postmark",
                token,
                sender,
                recipient: "not-an-email",
            }),
        WatchdogAlertCanaryError,
    );
});

test("watchdog alert canary fails once without disclosing provider details", async () => {
    for (const response of [
        new Response(JSON.stringify({ ErrorCode: 401, Message: `rejected ${recipient}` }), { status: 401 }),
        new Response(JSON.stringify({ ErrorCode: 300, Message: `rejected ${recipient}` }), { status: 200 }),
        new Response(JSON.stringify({ ErrorCode: 0, MessageID: "" }), { status: 200 }),
    ]) {
        let calls = 0;
        await assert.rejects(
            sendWatchdogAlertCanary({
                request: buildWatchdogAlertCanaryRequest({
                    origin: WATCHDOG_ALERT_PRODUCTION_ORIGIN,
                    transport: "postmark",
                    token,
                    sender,
                    recipient,
                }),
                fetchImpl: async () => {
                    calls += 1;
                    return response.clone();
                },
            }),
            (error: unknown) => {
                assert.ok(error instanceof WatchdogAlertCanaryError);
                assert.doesNotMatch(error.message, /sensitive|example\.invalid/);
                return true;
            },
        );
        assert.equal(calls, 1);
    }

    let networkCalls = 0;
    await assert.rejects(
        sendWatchdogAlertCanary({
            request: buildWatchdogAlertCanaryRequest({
                origin: WATCHDOG_ALERT_PRODUCTION_ORIGIN,
                transport: "postmark",
                token,
                sender,
                recipient,
            }),
            fetchImpl: async () => {
                networkCalls += 1;
                throw new Error(`network failed for ${recipient}`);
            },
        }),
        (error: unknown) => error instanceof WatchdogAlertCanaryError && error.code === "postmark_request_failed",
    );
    assert.equal(networkCalls, 1);
});
