import assert from "node:assert/strict";
// @ts-expect-error Bun's runtime mock API is available when this test is run with Bun.
import { mock } from "bun:test";

process.env.IS_BUILD = "true";
process.env.EMAIL_TRANSPORT = "capture";
process.env.EMAIL_CAPTURE_ENABLED = "true";
process.env.KAMOONI_DEPLOYMENT_ENV = "staging";
Reflect.set(process.env, "NODE_ENV", "production");
process.env.CIRCLES_URL = "https://staging.kamooni.org";
process.env.NEXT_PUBLIC_APP_URL = "https://staging.kamooni.org";
process.env.NEXT_PUBLIC_SITE_URL = "https://staging.kamooni.org";
delete process.env.POSTMARK_API_TOKEN;
delete process.env.POSTMARK_SENDER_EMAIL;

let authorized = false;
let databaseReads = 0;
let authorizationChecks = 0;
const tokenUrl = "https://staging.kamooni.org/verify-email?token=PRIVATE_BOUNDARY_TOKEN";
const documents = [
    {
        to: "person@example.test",
        templateAlias: "email-verification",
        actionUrl: tokenUrl,
        createdAt: new Date("2026-10-29T10:00:00.000Z"),
        expiresAt: new Date("2026-10-29T22:00:00.000Z"),
    },
];

mock.module("@/lib/auth/superadmin", () => ({
    requireSuperAdmin: async () => {
        authorizationChecks += 1;
        if (!authorized) throw new Error("Unauthorized");
        return "did:admin";
    },
}));
mock.module("@/lib/data/db", () => ({
    getDb: async () => {
        databaseReads += 1;
        return {
            collection: () => ({
                find: () => ({
                    sort: () => ({
                        limit: () => ({ toArray: async () => documents }),
                    }),
                }),
            }),
        };
    },
}));

const { listCapturedEmails } = await import("./captured-emails");

await assert.rejects(listCapturedEmails(), /Unauthorized/);
assert.equal(authorizationChecks, 1);
assert.equal(databaseReads, 0, "unauthorized collection access is rejected before Mongo is read");

authorized = true;
const result = await listCapturedEmails(new Date("2026-10-29T11:00:00.000Z"));
assert.equal(databaseReads, 1);
assert.equal(result[0]?.actionUrl, tokenUrl);

console.log("captured email collection authorization boundary tests passed");
