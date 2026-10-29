import assert from "node:assert/strict";

process.env.IS_BUILD = "true";
process.env.EMAIL_TRANSPORT = "capture";
process.env.EMAIL_CAPTURE_ENABLED = "true";
process.env.KAMOONI_DEPLOYMENT_ENV = "staging";
Reflect.set(process.env, "NODE_ENV", "production");
process.env.CIRCLES_URL = "https://staging.kamooni.org";
process.env.NEXT_PUBLIC_APP_URL = "https://staging.kamooni.org";
delete process.env.POSTMARK_API_TOKEN;
delete process.env.POSTMARK_SENDER_EMAIL;

const { buildCapturedEmailDocument, DEFAULT_CAPTURE_TTL_MS, PASSWORD_RESET_CAPTURE_TTL_MS } = await import(
    "./captured-emails"
);

const now = new Date("2026-10-29T10:00:00.000Z");
const verification = buildCapturedEmailDocument(
    {
        to: "person@example.test",
        templateAlias: "email-verification",
        templateModel: {
            name: "Test Person",
            actionUrl: "https://staging.kamooni.org/verify-email?token=verification-secret",
            arbitraryHtml: "<script>not stored</script>",
        },
    },
    now,
);

assert.equal(verification.displayName, "Test Person");
assert.equal(verification.expiresAt.getTime() - now.getTime(), DEFAULT_CAPTURE_TTL_MS);
assert.equal("templateModel" in verification, false, "arbitrary template content is not retained");

const notification = buildCapturedEmailDocument(
    {
        to: " person@example.test\nspoofed ",
        templateAlias: " notification-reminder\nspoofed ",
        templateModel: { actionUrl: "https://staging.kamooni.org/chat/example?view=unread" },
    },
    now,
);
assert.equal(notification.to.includes("\n"), false, "recipient control characters are removed");
assert.equal(notification.templateAlias.includes("\n"), false, "template alias control characters are removed");
assert.equal(notification.actionUrl, "https://staging.kamooni.org/chat/example?view=unread");

for (const unsafeActionUrl of [
    "https://evil.example/chat",
    "https://user:password@staging.kamooni.org/chat",
    "https://staging.kamooni.org/chat#token",
    "https://staging.kamooni.org/chat?token=secret",
    "https://staging.kamooni.org/chat?redirect=https://evil.example",
]) {
    const captured = buildCapturedEmailDocument({
        to: "person@example.test",
        templateAlias: "notification-reminder",
        templateModel: { actionUrl: unsafeActionUrl },
    });
    assert.equal(captured.actionUrl, undefined, `unsafe optional action URL is omitted: ${unsafeActionUrl}`);
}

const reset = buildCapturedEmailDocument(
    {
        to: "person@example.test",
        templateAlias: "password-reset",
        templateModel: { actionUrl: "https://staging.kamooni.org/reset-password?token=reset-secret" },
    },
    now,
);
assert.equal(reset.expiresAt.getTime() - now.getTime(), PASSWORD_RESET_CAPTURE_TTL_MS);
assert.ok(reset.expiresAt.getTime() - now.getTime() <= DEFAULT_CAPTURE_TTL_MS);

assert.throws(() =>
    buildCapturedEmailDocument({
        to: "person@example.test",
        templateAlias: "email-verification",
        templateModel: { actionUrl: "https://kamooni.org/verify-email?token=must-not-leak" },
    }),
);
assert.throws(() =>
    buildCapturedEmailDocument({
        to: "person@example.test",
        templateAlias: "password-reset",
        templateModel: {
            actionUrl: "https://staging.kamooni.org/reset-password?token=secret&redirect=https://evil.example",
        },
    }),
);

console.log("captured email retention and field tests passed");
