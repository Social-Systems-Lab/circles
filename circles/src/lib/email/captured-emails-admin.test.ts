import assert from "node:assert/strict";

process.env.IS_BUILD = "true";
process.env.CIRCLES_MONGODB_DATABASE = "circles_stage1a_test_email_admin";
process.env.EMAIL_TRANSPORT = "capture";
process.env.EMAIL_CAPTURE_ENABLED = "true";
process.env.KAMOONI_DEPLOYMENT_ENV = "staging";
Reflect.set(process.env, "NODE_ENV", "production");
process.env.CIRCLES_URL = "https://staging.kamooni.org";
process.env.NEXT_PUBLIC_APP_URL = "https://staging.kamooni.org";
process.env.NEXT_PUBLIC_SITE_URL = "https://staging.kamooni.org";
delete process.env.APP_URL;
delete process.env.SITE_URL;
delete process.env.POSTMARK_API_TOKEN;
delete process.env.POSTMARK_SENDER_EMAIL;

const { loadCapturedEmailInbox, loadCapturedEmailInboxPageData } = await import("./captured-emails-admin");

const document = {
    to: "person@example.test",
    templateAlias: "email-verification",
    actionUrl: "https://staging.kamooni.org/verify-email?token=admin-only-token",
    createdAt: new Date("2026-10-29T10:00:00.000Z"),
    expiresAt: new Date("2026-10-29T22:00:00.000Z"),
};

let listCalls = 0;
const allowed = await loadCapturedEmailInbox({
    authorize: async () => "did:admin",
    list: async () => {
        listCalls += 1;
        return [document];
    },
});
assert.equal(listCalls, 1);
assert.equal(allowed[0]?.actionUrl, document.actionUrl);

for (const label of ["regular user", "anonymous user"]) {
    listCalls = 0;
    await assert.rejects(
        loadCapturedEmailInbox({
            authorize: async () => {
                throw new Error(`Unauthorized ${label}`);
            },
            list: async () => {
                listCalls += 1;
                return [document];
            },
        }),
    );
    assert.equal(listCalls, 0, `${label} cannot read capture records`);
}

const token = "PRIVATE_UNAUTHORIZED_TOKEN";
const unauthorizedPage = await loadCapturedEmailInboxPageData(async () => {
    throw new Error(`Unauthorized ${token}`);
});
assert.deepEqual(unauthorizedPage, { status: "not_found" });
assert.equal(JSON.stringify(unauthorizedPage).includes(token), false, "unauthorized page data cannot expose tokens");

console.log("captured email admin authorization tests passed");
