import assert from "node:assert/strict";
// @ts-expect-error Bun provides test at runtime; Bun types are not installed.
import { test } from "bun:test";
import { sendEmail } from "./email";

test("local Mailpit SMTP integration captures the pending verification link", async () => {
    const mailpitUrl = process.env.MAILPIT_HTTP_URL;
    if (!mailpitUrl) throw new Error("MAILPIT_HTTP_URL must be set by the isolated Mailpit test harness");

    const token = "isolated-mailpit-probe+/?=";
    const verificationUrl = `http://127.0.0.1:3000/signup/verify?token=${encodeURIComponent(token)}`;
    await sendEmail({
        to: "mailpit-test@example.invalid",
        templateAlias: "email-verification",
        templateModel: { name: "Isolated Test", actionUrl: verificationUrl },
    });

    const response = await fetch(`${mailpitUrl}/view/latest.txt`);
    assert.equal(response.status, 200, "Mailpit should expose the newly captured text message");
    const text = await response.text();
    assert.ok(text.includes(verificationUrl), "captured message preserves the verification route and encoded token");
});
