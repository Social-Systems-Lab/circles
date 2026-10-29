import assert from "node:assert/strict";
import { getEmailTransportConfiguration, isEmailTransportAvailable } from "./capture-config";
import { sendEmailWithDependencies } from "@/lib/data/email";

assert.deepEqual(getEmailTransportConfiguration({}), { transport: "unconfigured" });
assert.deepEqual(
    getEmailTransportConfiguration({ POSTMARK_API_TOKEN: "token", POSTMARK_SENDER_EMAIL: "sender@example.test" }),
    { transport: "postmark" },
);
assert.equal(
    getEmailTransportConfiguration({ POSTMARK_API_TOKEN: "token" }).transport,
    "refused",
    "partially configured Postmark cannot report delivery",
);
assert.equal(
    isEmailTransportAvailable({
        EMAIL_TRANSPORT: "capture",
        EMAIL_CAPTURE_ENABLED: "true",
        KAMOONI_DEPLOYMENT_ENV: "staging",
        NODE_ENV: "production",
        CIRCLES_URL: "https://staging.kamooni.org",
    }),
    true,
    "transport-aware callers recognize staging capture",
);

console.log("email transport failure test passed");

const token = "PRIVATE_CAPTURE_TOKEN";
const captured: Array<Record<string, unknown>> = [];
const logs: string[] = [];
const originalLog = console.log;
console.log = (...values: unknown[]) => logs.push(values.map(String).join(" "));
try {
    await sendEmailWithDependencies(
        {
            to: "person@example.test",
            templateAlias: "email-verification",
            templateModel: { actionUrl: `https://staging.kamooni.org/verify-email?token=${token}` },
        },
        {
            resolveTransport: () => ({ transport: "capture", origin: "https://staging.kamooni.org" }),
            capture: async (email) => {
                captured.push(email);
            },
            postmark: async () => assert.fail("capture must not invoke Postmark"),
        },
    );
} finally {
    console.log = originalLog;
}
assert.equal(captured.length, 1, "capture must persist before reporting success");
assert.equal(logs.join(" ").includes(token), false, "successful capture logs never contain the token");

await assert.rejects(
    sendEmailWithDependencies(
        {
            to: "person@example.test",
            templateAlias: "password-reset",
            templateModel: { actionUrl: `https://staging.kamooni.org/reset-password?token=${token}` },
        },
        {
            resolveTransport: () => ({ transport: "capture", origin: "https://staging.kamooni.org" }),
            capture: async () => {
                throw new Error(`storage error containing ${token}`);
            },
            postmark: async () => assert.fail("capture must not invoke Postmark"),
        },
    ),
    (error: unknown) => error instanceof Error && !error.message.includes(token),
    "capture errors must redact token-bearing dependency failures",
);

let postmarkCalls = 0;
await sendEmailWithDependencies(
    { to: "person@example.test", templateAlias: "notification-reminder", templateModel: {} },
    {
        resolveTransport: () => ({ transport: "postmark" }),
        capture: async () => assert.fail("Postmark mode must not capture"),
        postmark: async () => {
            postmarkCalls += 1;
        },
    },
);
assert.equal(postmarkCalls, 1, "Postmark delivery semantics remain available");
