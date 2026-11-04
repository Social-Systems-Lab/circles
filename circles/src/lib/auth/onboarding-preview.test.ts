import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const route = readFileSync("src/app/dev/onboarding-preview/page.tsx", "utf8");
const preview = readFileSync("src/app/dev/onboarding-preview/preview.tsx", "utf8");
const signup = readFileSync("src/components/forms/signup/pending-signup-form.tsx", "utf8");
const checkEmail = readFileSync("src/components/forms/signup/check-email-card.tsx", "utf8");
const passwordCard = readFileSync("src/components/forms/signup/password-creation-card.tsx", "utf8");
const pendingActions = readFileSync("src/components/forms/signup/pending-actions.ts", "utf8");

assert.match(route, /process\.env\.NODE_ENV !== "development"\) notFound\(\)/);
assert.match(preview, /<PendingSignupForm preview previewState=\{previewState\} \/>/);
assert.match(preview, /<CheckEmailCard preview sampleEmail=/);
assert.match(preview, /<PasswordCreationCard preview previewState=\{previewState\} \/>/);

assert.match(
    signup,
    /useEffect\(\(\) => \{\s*if \(preview\) return;\s*void import\("altcha"\);\s*fetch\("\/api\/altcha\/challenge"/,
    "signup preview exits initialization before loading ALTCHA or requesting a challenge",
);
assert.match(
    signup,
    /useEffect\(\(\) => \{\s*if \(preview\) return;[\s\S]*?resumePendingRegistrationAction\(\)/,
    "signup preview exits before attempting pending-registration resume",
);
assert.match(
    signup,
    /if \(preview\) \{\s*setMessage\([\s\S]*?return;\s*\}\s*const next = validate/,
    "signup preview submit never reaches the registration action",
);

assert.match(
    checkEmail,
    /if \(preview\) \{[\s\S]*?return \(\) => window\.clearInterval\(timer\);\s*\}\s*void resumePendingRegistrationAction\(\)/,
    "check-email preview avoids registration resume during initialization",
);
assert.match(
    checkEmail,
    /if \(preview\) \{[\s\S]*?no verification email was sent\.[\s\S]*?return;\s*\}\s*setBusy\(true\);\s*try \{\s*const result = await resendPendingRegistrationAction\(\)/,
    "check-email preview resend remains local",
);
assert.match(
    checkEmail,
    /if \(preview\) \{[\s\S]*?no email was sent\.[\s\S]*?return;\s*\}\s*setBusy\(true\);\s*try \{\s*const result = await correctPendingRegistrationEmailAction/,
    "check-email preview correction remains local",
);
assert.match(checkEmail, /result\.resendAvailableAt \? Date\.parse\(result\.resendAvailableAt\)/);
assert.match(checkEmail, /result\.email\?\.toLowerCase\(\) === newEmail\.trim\(\)\.toLowerCase\(\)/);
assert.doesNotMatch(checkEmail, /a fresh verification link has been sent/);
assert.match(pendingActions, /email: state\.success \? \(state\.email \?\? null\) : null/);
assert.match(pendingActions, /resendAvailableAt:[\s\S]*?state\.verificationLastSentAt/);
assert.match(
    passwordCard,
    /if \(preview\) \{\s*setMessage\([\s\S]*?no password was sent\.[\s\S]*?return;\s*\}[\s\S]*?completePendingRegistrationAction\(password\)/,
    "password preview exits before account completion",
);
assert.doesNotMatch(passwordCard, /localStorage|sessionStorage/);

console.log("onboarding preview safety tests passed");
