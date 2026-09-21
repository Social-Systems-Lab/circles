import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const readSource = (path: string) => readFileSync(path, "utf8");

const mountedUiSources = [
    "src/components/forms/login/login-form.tsx",
    "src/app/circles/[handle]/settings/subscription/page.tsx",
    "src/app/circles/[handle]/settings/subscription/subscription-form-settings.tsx",
    "src/app/circles/[handle]/home/page.tsx",
    "src/components/modules/home/AboutPage.tsx",
];

for (const path of mountedUiSources) {
    const source = readSource(path);
    assert.doesNotMatch(source, /VibeId|VibeID|vibe-id|membershipCredential/i, `${path} keeps VibeID out of live UI`);
}

assert.equal(existsSync("src/components/auth/vibe-id-auth-button.tsx"), true, "VibeID auth component remains intact");
assert.equal(
    existsSync("src/app/circles/[handle]/settings/subscription/vibe-id-settings-card.tsx"),
    true,
    "VibeID settings component remains intact",
);
assert.equal(
    existsSync("src/components/modules/home/MembershipCredentialCard.tsx"),
    true,
    "credential UI remains intact",
);
assert.equal(existsSync("src/app/api/vibe-id/request/route.ts"), true, "VibeID backend remains intact");

console.log("VibeID live UI visibility tests passed");
