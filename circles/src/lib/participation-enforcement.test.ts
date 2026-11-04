import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

const sharedServerAuth = read("src/lib/auth/auth.ts");
const sharedClientAuth = read("src/lib/auth/client-auth.ts");

assert.match(
    sharedServerAuth,
    /featureInput\.needsToBeVerified[\s\S]*?!canParticipate\(user\)/,
    "shared server authorization enforces participation readiness",
);
assert.match(
    sharedClientAuth,
    /feature\.needsToBeVerified && !canParticipate\(user\)/,
    "client authorization mirrors the shared readiness policy",
);

for (const [label, path] of [
    ["feed mutations", "src/components/modules/feeds/actions.ts"],
    ["Mongo chat mutations", "src/components/modules/chat/mongo-actions.ts"],
    ["task mutations", "src/app/circles/[handle]/tasks/actions.ts"],
    ["event mutations", "src/app/circles/[handle]/events/actions.ts"],
    ["circle creation", "src/components/circle-wizard/actions.ts"],
    ["global creation", "src/components/global-create/actions.ts"],
    ["Proof of Humanity verification", "src/components/modules/home/proof-of-humanity-actions.ts"],
] as const) {
    assert.match(read(path), /canParticipate\(/, `${label} retains a server-side participation check`);
}

console.log("participation enforcement tests passed");
