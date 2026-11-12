import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("src/components/profile-completion/profile-completion-checklist.tsx", "utf8");

assert.match(source, /You&apos;re ready! Welcome to Kamooni/);
assert.match(source, /Your profile is complete\. You can now take part across Kamooni\./);
assert.match(source, /completeProfileCompletionWelcomeStep\(\)/);
assert.match(source, /Start Kamoonying/);
assert.doesNotMatch(
    source,
    /Help keep Kamooni independent|SUPPORTER_OPTIONS|One-time donation|Maybe later|create-checkout-session|saveDonationIntentAction/,
    "the profile-completion celebration does not request donations",
);

console.log("profile completion celebration tests passed");
