import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const actions = readFileSync("src/components/forms/signup/pending-actions.ts", "utf8");
const recoveryForm = readFileSync("src/components/forms/signup/pending-recovery-form.tsx", "utf8");
const recoveryPage = readFileSync("src/app/(auth)/signup/recover/page.tsx", "utf8");
const passwordCard = readFileSync("src/components/forms/signup/password-creation-card.tsx", "utf8");
const checkEmailCard = readFileSync("src/components/forms/signup/check-email-card.tsx", "utf8");
const runtime = readFileSync("src/lib/auth/pending-registration-runtime.ts", "utf8");

assert.match(actions, /requestPendingRegistrationRecoveryAction/);
assert.match(actions, /authorizePendingRegistrationChallenge\(request\.clientIp, deps\)/);
assert.match(actions, /verifyAltchaPayload\(input\.altcha\)/);
assert.match(actions, /return \{ success: true, message: GENERIC \}/);
const recoveryAction = actions.slice(
    actions.indexOf("export async function requestPendingRegistrationRecoveryAction"),
    actions.indexOf("async function pendingMutation"),
);
assert.doesNotMatch(recoveryAction, /verifiedContinuationSecret/);

assert.match(recoveryForm, /type="email"/);
assert.match(recoveryForm, /<altcha-widget/);
assert.match(recoveryForm, /min-h-12/);
assert.match(recoveryForm, /If this verified signup can continue/);
assert.doesNotMatch(recoveryForm, /localStorage|sessionStorage/);

assert.match(recoveryPage, /isPendingRegistrationEnabled\(\)/);
assert.match(recoveryPage, /isRegistrationModeAllowed\("pending"\)/);
assert.match(passwordCard, /href="\/signup\/recover"/);
assert.match(checkEmailCard, /href="\/signup\/recover"/);
assert.match(runtime, /baseUrl: requirePendingRegistrationPublicOrigin/);
assert.match(runtime, /allowLoopbackHttp: process\.env\.NODE_ENV !== "production"/);

console.log("pending registration recovery UI/security contract tests passed");
