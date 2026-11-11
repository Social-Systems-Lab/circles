import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const actions = readFileSync("src/app/onboarding/actions.ts", "utf8");
const route = readFileSync("src/app/onboarding/page.tsx", "utf8");
const persistence = readFileSync("src/lib/data/resumable-onboarding.ts", "utf8");
const sharedCircleData = readFileSync("src/lib/data/circle.ts", "utf8");
const userDto = readFileSync("src/lib/data/client-user-dto.ts", "utf8");
const shell = readFileSync("src/components/onboarding/resumable-onboarding-shell.tsx", "utf8");

assert.match(
    actions,
    /getAuthenticatedUserDid\(\)/,
    "mutations derive the member identity from the authenticated session",
);
assert.match(
    actions,
    /ensurePersonalOnboardingState\(did/,
    "actions load only the authenticated member's personal profile",
);
assert.doesNotMatch(actions, /function\s+(?:navigateOnboardingCard|skipOnboardingCard)\s*\(\s*did\s*:/);
const navigationAction = actions.slice(
    actions.indexOf("export async function navigateOnboardingCard"),
    actions.indexOf("export async function skipOnboardingCard"),
);
assert.doesNotMatch(navigationAction, /status\.complete/, "navigation permits opening completed cards");
assert.match(persistence, /did,\s*circleType:\s*"user"/, "database mutations are scoped to personal profiles");
assert.match(route, /getAuthenticatedUserDid\(\)/, "the onboarding route requires an authenticated member");
assert.match(route, /if \(!userDid\) redirect\("\/login/, "unauthenticated requests are redirected to login");
assert.match(
    route,
    /if \(params\.card && !isOnboardingCardId\(params\.card\)\) redirect\("\/onboarding"\)/,
    "retired onboarding card URLs return to the visible onboarding flow",
);
assert.match(persistence, /"onboardingState\.currentCard"/);
assert.match(persistence, /"onboardingState\.skippedCards"/);
assert.doesNotMatch(
    persistence,
    /\$set:[\s\S]*completedOnboardingSteps/,
    "legacy onboarding markers are never updated here",
);
assert.match(
    persistence,
    /onboardingState:\s*1/,
    "navigation is loaded from the member profile for cross-device resumption",
);
assert.doesNotMatch(
    sharedCircleData,
    /onboardingState:\s*1/,
    "shared/discovery projections omit private navigation state",
);
assert.doesNotMatch(userDto, /onboardingState/, "client profile DTOs do not expose navigation state to other viewers");
assert.match(shell, /href=\{`\/onboarding\?card=\$\{encodeURIComponent\(step\.id\)\}`\}/);
assert.match(shell, /catch \{/, "rejected server actions produce visible error feedback");
assert.match(shell, /role="alert"/, "navigation failures are announced accessibly");
const completionAction = actions.slice(actions.indexOf("export async function acknowledgeOnboardingCompletion"));
assert.doesNotMatch(completionAction, /unfinishedUnskipped|Please continue or skip/);
assert.match(completionAction, /persistOnboardingCompletionAcknowledgement\(own\.did\)/);
assert.match(completionAction, /redirectTo:\s*getCircleDefaultPath\(own\.profile\)/);
assert.match(actions, /import \{ getCircleDefaultPath \} from "@\/lib\/utils\/circle-routes"/);
assert.match(shell, /if \(result\.redirectTo\) router\.push\(result\.redirectTo\)/);
assert.match(
    shell,
    /pending[\s\S]*?requiredStepsComplete[\s\S]*?"Finish onboarding"[\s\S]*?"Finish for now"/,
    "the final action is labelled as onboarding completion only when required steps are complete",
);
assert.doesNotMatch(shell, /allRemainingSkipped|firstUnskippedIncomplete/);
assert.match(persistence, /enabledModules:\s*1/, "canonical profile routing data is loaded for exit destination");
assert.match(shell, /<progress[\s\S]*?aria-label="Onboarding progress"/);
assert.match(shell, /<details[^>]*>[\s\S]*?<summary>View progress<\/summary>/);
assert.match(shell, /pt-\[calc\(5rem\+env\(safe-area-inset-top,0px\)\)\]/);
assert.match(shell, /pb-\[calc\(5rem\+env\(safe-area-inset-bottom,0px\)\)\]/);
assert.match(
    shell,
    /<StepLink\s+key=\{step\.id\}\s+step=\{step\}\s+current=\{step\.id === currentCard\}\s+onSelect=\{navigate\}/,
);
assert.match(
    route,
    /navigationSaveFailed = !\(await persistOnboardingNavigation/,
    "direct navigation persistence failures are surfaced",
);

console.log("resumable onboarding authorization contract tests passed");
