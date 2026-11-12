import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const actions = readFileSync("src/app/onboarding/card-actions.ts", "utf8");
const cards = readFileSync("src/components/onboarding/resumable-onboarding-cards.tsx", "utf8");
const page = readFileSync("src/app/onboarding/page.tsx", "utf8");
const shell = readFileSync("src/components/onboarding/resumable-onboarding-shell.tsx", "utf8");
const onboardingStyles = readFileSync("src/components/onboarding/resumable-onboarding.module.css", "utf8");
const photoAction = readFileSync("src/components/modules/home/actions.ts", "utf8");
const mediaStorage = readFileSync("src/lib/data/circle-media-storage.ts", "utf8");

assert.match(
    actions,
    /getAuthenticatedUserDid\(\)/,
    "profile card writes derive identity from the authenticated session",
);
assert.match(
    actions,
    /profile\.circleType !== "user" \|\| profile\.did !== did/,
    "writes are restricted to the authenticated personal profile",
);
assert.match(actions, /description: introduction/, "introduction is persisted to canonical description");
assert.doesNotMatch(
    actions,
    /content:\s*introduction|completedOnboardingSteps/,
    "saving intro does not overwrite legacy content or markers",
);
assert.match(
    actions,
    /preparePersonalLocationForSave\(value, own\.profile\.location\)/,
    "location saves preserve existing values and normalize new pins",
);
assert.match(actions, /validateOnboardingLocation\(prepared\.location\)/, "location is validated on the server");
assert.match(actions, /accepted !== true/, "guideline acceptance requires an explicit affirmative value");
assert.match(actions, /acceptMissingCommunityGuidelines\(/, "guideline records are stored per principle");
assert.match(
    actions,
    /communityGuidelinesAcceptedAt:\s*own\.profile\.communityGuidelinesAcceptedAt \?\? now/,
    "the existing aggregate acceptance date is preserved",
);

assert.match(
    cards,
    /dynamic\(\(\) => import\("@\/components\/forms\/location-picker"\),[\s\S]*?ssr: false/,
    "the existing location picker is lazy-loaded client-side",
);
assert.match(
    cards,
    /<LocationPicker[\s\S]*?onChange=\{\(next\) =>/,
    "the canonical location picker handles search and map selection",
);
assert.match(cards, /max-h-72[\s\S]*?overflow-y-auto/, "guidelines are scrollable inside their card");
assert.ok(
    cards.indexOf("max-h-72") < cards.indexOf('id="onboarding-guidelines-agreement"'),
    "agreement stays visible outside the scroll region",
);
assert.match(cards, /const \[agreed, setAgreed\] = useState\(false\)/, "guidelines start unchecked");
assert.match(cards, /set\("picture", file\)/, "photo uses the existing profile image upload action");
assert.match(cards, /personalProfile/, "onboarding uses the privacy-safe personal location picker mode");
assert.match(cards, /Choose where people can find you/, "onboarding shows the personal location privacy guidance");
assert.match(cards, /realPersonCount[\s\S]*metInRealLifeCount/, "human verification levels remain distinct");
assert.doesNotMatch(cards, /Open your verification section/, "the misleading verification-section action is removed");
assert.doesNotMatch(
    cards,
    /#proof-of-humanity/,
    "the onboarding card does not redirect to the profile verification panel",
);
assert.match(
    cards,
    /You&apos;re ready to participate in Kamooni\. Human verification is an additional trust signal\. A member\s+who knows you can verify you later using the Verify Human action on your profile\./,
    "the human verification card explains the optional trust signal clearly",
);
assert.match(cards, /Human verification is optional during Phase 1\./);
assert.doesNotMatch(cards, /required to post publicly/i, "Phase 1 public posting is not gated on human verification");
assert.match(
    photoAction,
    /export const updateCircleField/,
    "the reused upload action remains the established implementation",
);
const profileUpdateAction = photoAction.slice(photoAction.indexOf("export const updateCircleField"));
assert.ok(
    profileUpdateAction.indexOf('ownerCircle.circleType === "user" && ownerCircle.did !== userDid') <
        profileUpdateAction.indexOf("saveCircleOwnedFile({"),
    "personal-profile ownership is checked before storing uploaded media",
);
assert.match(
    mediaStorage,
    /catch \(error\)[\s\S]*?cleanupRollback \?\? cleanup\)\(\[\.\.\.new Set\(rollbackUrls\)\][\s\S]*?throw error/,
    "failed profile writes clean newly uploaded media and preserve prior media references",
);
assert.match(
    page,
    /getHumanityVerificationSummary\(userDid, userDid\)/,
    "verification status is loaded server-side for the profile owner",
);
assert.match(shell, /onSavingChange=\{setCardSaving\}/, "shell prevents navigation while a card save is pending");
assert.match(shell, /hasUnsavedChanges && !window\.confirm/, "navigation warns before discarding unsaved card data");
assert.match(
    shell,
    /kamooni-emblem-yellow\.png[\s\S]*kamooni-wordmark-yellow\.png/,
    "onboarding uses the official Kamooni logo assets",
);
assert.doesNotMatch(shell, /hero-illustration/, "the decorative thumbnail is removed");
assert.doesNotMatch(
    shell,
    /styles\.(?:progressCard|contentCard|completionCard)|<CardHeader/,
    "branding, progress and card content share one onboarding frame",
);
assert.match(onboardingStyles, /--onboarding-primary: #2b643a/);
assert.match(onboardingStyles, /background: #ffffff/);
assert.doesNotMatch(
    onboardingStyles,
    /#f4ead0|#f6ca67|hero-illustration|flower-bg/,
    "the cream and gold page treatment and decorative artwork are removed",
);
assert.match(
    onboardingStyles,
    /\.progress::-webkit-progress-value\s*\{[^}]*background: var\(--onboarding-primary\)/,
    "completed progress uses the approved green",
);
assert.match(
    onboardingStyles,
    /\.surface \.primaryAction\s*\{[^}]*background: var\(--onboarding-primary\)[^}]*color: #ffffff/,
    "primary buttons use the approved green with white text",
);
assert.match(
    shell,
    /IntroductionOnboardingCard[\s\S]*CommunityGuidelinesOnboardingCard[\s\S]*LocationOnboardingCard[\s\S]*ProfilePhotoOnboardingCard[\s\S]*HumanVerificationOnboardingCard/,
    "all five functional cards are integrated into the existing shell",
);

console.log("onboarding card integration contract tests passed");
