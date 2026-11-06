import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const card = readFileSync("src/components/forms/signup/password-creation-card.tsx", "utf8");
const page = readFileSync("src/app/(auth)/signup/continue/page.tsx", "utf8");
const actions = readFileSync("src/components/forms/signup/pending-actions.ts", "utf8");
const runtime = readFileSync("src/lib/auth/pending-registration-runtime.ts", "utf8");
const verificationRoute = readFileSync("src/app/(auth)/signup/verify/route.ts", "utf8");

assert.match(card, /completePendingRegistrationAction\(password\)/);
assert.match(card, /password\.length < 8 \|\| password\.length > 128/);
assert.match(card, /password !== confirmation/);
assert.match(card, /autoComplete="new-password"/);
assert.match(card, /aria-label=\{showPassword \? "Hide password" : "Show password"\}/);
assert.match(card, /aria-label=\{showConfirmation \? "Hide confirmation" : "Show confirmation"\}/);
assert.match(card, /router\.replace\(result\.redirectTo \|\| "\/explore"\)/);
assert.doesNotMatch(card, /localStorage|sessionStorage/);
assert.match(page, /isPendingRegistrationEnabled\(\)/);
assert.match(page, /isRegistrationModeAllowed\("pending"\)/);
assert.match(page, /getVerifiedPendingRegistration\(id, secret, deps\)/);
assert.match(verificationRoute, /requirePendingRegistrationPublicOrigin\(\)/);
assert.match(verificationRoute, /buildPendingRegistrationRedirectUrl\("\/signup\/continue", publicOrigin\)/);
assert.doesNotMatch(verificationRoute, /request\.url/);
assert.doesNotMatch(verificationRoute, /new URL\("\/signup\/continue\?[^\"]*token/);

const completionAction = actions.slice(actions.indexOf("export async function completePendingRegistrationAction"));
assert.ok(
    completionAction.indexOf("getVerifiedPendingRegistration(") <
        completionAction.indexOf("provisionPendingRegistration("),
    "completion validates the verified capability before one-time provisioning consumes it",
);
assert.match(completionAction, /validatePendingRedirect\(authorized\.redirectTo\)/);
assert.match(completionAction, /validatePendingRedirect\(authorized\.redirectTo\) \|\| "\/onboarding"/);
assert.match(completionAction, /jar\.delete\(VERIFIED_COOKIE\)/);
assert.match(completionAction, /jar\.delete\(PENDING_COOKIE\)/);
assert.match(runtime, /await createUserSession\(user, account\.did\)/);

console.log("password creation card contract tests passed");
