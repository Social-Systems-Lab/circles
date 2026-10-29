import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import PilotCheckEmailPage from "@/app/(auth)/signup/pilot/check-email/page";

const failedMarkup = renderToStaticMarkup(
    await PilotCheckEmailPage({
        searchParams: Promise.resolve({
            email: "person@example.test",
            handle: "test-person",
            delivery: "failed",
        }),
    }),
);

assert.doesNotMatch(failedMarkup, /We(?:&#x27;|')ve sent/i, "failed delivery UI must not claim an email was sent");
assert.match(failedMarkup, /could not send/i);
assert.match(failedMarkup, /settings\/subscription#email-verification/);

const sentMarkup = renderToStaticMarkup(
    await PilotCheckEmailPage({ searchParams: Promise.resolve({ delivery: "sent" }) }),
);
assert.match(sentMarkup, /Check your email/);
assert.match(sentMarkup, /verification link/i);

console.log("signup check-email page delivery-state tests passed");
