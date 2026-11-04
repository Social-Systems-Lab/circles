import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
    getCircleLifecycleStatus,
    getCircleLifecycleStatusBadgeClassName,
    getCircleLifecycleStatusLabel,
    getCircleLifecycleTransitions,
    submitCircleLifecycleChange,
} from "./circle-lifecycle-ui";
import type { CircleModerationStatus } from "@/models/models";

const labels = (moderationStatus?: "active" | "paused" | "suspended" | "removed") =>
    getCircleLifecycleTransitions({ moderationStatus }).map((transition) => transition.label);

assert.deepEqual(labels("active"), ["Pause", "Suspend", "Remove"]);
assert.deepEqual(labels("paused"), ["Reactivate", "Suspend", "Remove"]);
assert.deepEqual(labels("suspended"), ["Reactivate", "Remove"]);
assert.deepEqual(labels("removed"), []);
assert.equal(getCircleLifecycleStatus({}), "active", "legacy missing status uses the lifecycle policy default");
assert.equal(getCircleLifecycleStatusLabel({}), "Active");
assert.equal(getCircleLifecycleStatusBadgeClassName({ moderationStatus: "active" }), "border-green-300 bg-green-100 text-green-900");
assert.equal(getCircleLifecycleStatusBadgeClassName({ moderationStatus: "paused" }), "border-amber-300 bg-amber-100 text-amber-900");
assert.equal(getCircleLifecycleStatusBadgeClassName({ moderationStatus: "suspended" }), "border-red-300 bg-red-100 text-red-900");
assert.equal(getCircleLifecycleStatusBadgeClassName({ moderationStatus: "removed" }), "border-slate-700 bg-slate-700 text-white");

assert.deepEqual(
    getCircleLifecycleTransitions({ moderationStatus: "active", visibility: "public" }),
    getCircleLifecycleTransitions({ moderationStatus: "active", visibility: "secret" }),
    "public and secret Circles use identical lifecycle controls",
);

const actionCalls: Array<[string, CircleModerationStatus, string]> = [];
const action = async (...args: [string, CircleModerationStatus, string]) => {
    actionCalls.push(args);
    return { success: true };
};

const run = async () => {
    await assert.rejects(
        submitCircleLifecycleChange(action, "circle-id", "paused", "   "),
        /moderation reason is required/i,
    );
    assert.equal(actionCalls.length, 0, "empty moderation reason cannot submit");
    await submitCircleLifecycleChange(action, "circle-id", "paused", "  required reason  ");
    assert.deepEqual(actionCalls[0], ["circle-id", "paused", "required reason"]);
    await submitCircleLifecycleChange(action, "removed-circle", "removed", "policy violation");
    assert.deepEqual(
        actionCalls[1],
        ["removed-circle", "removed", "policy violation"],
        "lifecycle Remove uses the lifecycle action contract",
    );

    const tabSource = readFileSync(fileURLToPath(new URL("./tabs/circles-tab.tsx", import.meta.url)), "utf8");
    assert.match(tabSource, /submitCircleLifecycleChange\([\s\S]*?changeCircleModerationStatusAction,/);
    assert.doesNotMatch(
        tabSource,
        /moderationTarget\s*===\s*["']removed["'][\s\S]{0,300}(deleteEntity|deleteCircle)\s*\(/,
        "lifecycle Remove does not use physical deletion",
    );
    assert.match(tabSource, /await deleteEntity\(circleToDelete\._id\)/, "permanent Delete remains separate");
    assert.match(tabSource, /Permanently delete/, "permanent Delete is clearly labelled");

    console.log("admin Circle lifecycle UI tests passed");
};

void run();
