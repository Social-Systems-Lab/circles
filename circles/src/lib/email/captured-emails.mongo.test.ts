import assert from "node:assert/strict";
import { MongoClient } from "mongodb";
import type { CapturedEmailDocument } from "./captured-email-storage";

const uri = process.env.EMAIL_CAPTURE_TEST_MONGODB_URI;
if (!uri) throw new Error("EMAIL_CAPTURE_TEST_MONGODB_URI is required for the disposable Mongo integration test.");

const parsed = new URL(uri);
if (!["127.0.0.1", "localhost", "::1"].includes(parsed.hostname)) {
    throw new Error("Email capture integration tests require a localhost Mongo instance.");
}
const databaseName = parsed.pathname.replace(/^\//, "");
if (!/^circles_stage1a_test_email_capture_[a-z0-9_-]+$/i.test(databaseName)) {
    throw new Error("Disposable email capture database name is invalid.");
}

process.env.IS_BUILD = "true";
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

const { listUnexpiredCapturedEmails, storeCapturedEmailInCollection } = await import("./captured-email-storage");
const client = new MongoClient(uri);

try {
    await client.connect();
    const database = client.db(databaseName);
    const emails = database.collection<CapturedEmailDocument>("stagingCapturedEmails");
    const now = new Date("2026-10-29T10:00:00.000Z");

    await storeCapturedEmailInCollection(
        emails,
        {
            to: "older@example.test",
            templateAlias: "notification-reminder",
            templateModel: { actionUrl: "https://staging.kamooni.org/chat/older" },
        },
        new Date(now.getTime() - 60_000),
    );
    await storeCapturedEmailInCollection(
        emails,
        {
            to: "newer@example.test",
            templateAlias: "email-verification",
            templateModel: { actionUrl: "https://staging.kamooni.org/verify-email?token=integration-token" },
        },
        now,
    );
    await emails.insertOne({
        to: "expired@example.test",
        templateAlias: "notification-reminder",
        createdAt: new Date(now.getTime() - 120_000),
        expiresAt: new Date(now.getTime() - 1),
    });

    const indexes = await emails.indexes();
    const ttlIndex = indexes.find((index) => index.name === "captured_email_expiry");
    assert.equal(ttlIndex?.expireAfterSeconds, 0, "capture collection has an absolute-expiry TTL index");

    const listed = await listUnexpiredCapturedEmails(emails, now);
    assert.deepEqual(
        listed.map((email) => email.to),
        ["newer@example.test", "older@example.test"],
        "listing is newest-first and excludes expired records before asynchronous TTL cleanup",
    );

    console.log("disposable Mongo captured-email integration tests passed");
} finally {
    await client
        .db(databaseName)
        .dropDatabase()
        .catch(() => undefined);
    await client.close();
}
