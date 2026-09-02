import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const actions = readFileSync("src/app/circles/[handle]/tasks/actions.ts", "utf8");
const start = actions.indexOf("export async function updateTaskAction");
const end = actions.indexOf("export async function updateTaskPriorityAction", start);
assert.ok(start >= 0 && end > start);
const update = actions.slice(start, end);

const gate = update.indexOf("resolveTaskUpdateOwnership(");
assert.ok(gate >= 0, "updateTaskAction must use canonical Task ownership gate");
const updateOrchestration = update.indexOf("orchestrateShiftUpdate(");
assert.ok(updateOrchestration > gate, "Shift update orchestration must remain downstream of Task ownership gate");
for (const authorization of ["canReadCircle(", "assertCircleWritesAllowed(", "isAuthorized("]) {
    const authorizationIndex = update.indexOf(authorization);
    assert.ok(
        authorizationIndex >= 0 && authorizationIndex < updateOrchestration,
        `${authorization} must exist and precede Shift update orchestration`,
    );
}
for (const operation of [
    "getCircleById(",
    "assertCircleWritesAllowed(",
    "saveFile(",
    "deleteFile(",
    "updateTask(",
    "upsertShiftNoticeboardPost(",
    "revalidatePath(",
]) {
    const operationIndex = update.indexOf(operation);
    assert.ok(operationIndex >= 0 && operationIndex > gate, `${operation} must exist downstream of ownership gate`);
}
assert.match(update, /const targetCircle = sourceCircle;/);
assert.match(update, /circleId: sourceCircleId,/);
assert.match(update, /canReadCircle\(userDid, sourceCircle\)/);
assert.doesNotMatch(update, /getCircleById\(requested/);
assert.doesNotMatch(update, /didTargetCircleChange|canCreateInTarget|move tasks/);

const orchestration = readFileSync("src/lib/data/shift-update-orchestration.ts", "utf8");
const resolver = orchestration.indexOf("resolveShiftNoticeboardBinding(");
assert.ok(resolver >= 0, "production Shift update orchestration must use the real backlink resolver");
for (const operation of ["uploadMedia()", "deleteOldMedia()", "updateTask(uploadedMedia)"]) {
    const operationIndex = orchestration.indexOf(operation);
    assert.ok(operationIndex > resolver, `${operation} must remain downstream of backlink resolution`);
}
const synchronize = orchestration.indexOf("synchronizeNoticeboard(validatedBinding)");
const createReplacementGuard = orchestration.indexOf('return { status: "noticeboard-sync-failed", error }');
assert.ok(synchronize > resolver, "noticeboard synchronization must remain downstream of backlink resolution");
assert.ok(createReplacementGuard > synchronize, "noticeboard failure must return without replacement creation");

const helperStart = actions.indexOf("const upsertShiftNoticeboardPost");
const helperEnd = actions.indexOf("/**\n * Get all tasks", helperStart);
const helper = actions.slice(helperStart, helperEnd);
assert.match(helper, /noticeboardPostId !== null[\s\S]*!validatedExistingBinding/);
assert.ok(
    helper.indexOf("if (validatedExistingBinding)") < helper.indexOf("createPost("),
    "validated existing backlink path must precede absent-backlink creation",
);
assert.doesNotMatch(helper, /Failed to update linked noticeboard post/);
assert.doesNotMatch(helper, /catch\s*\([^)]*\)[\s\S]*createPost/);

const createStart = actions.indexOf("export async function createTaskAction");
const createEnd = actions.indexOf("export async function updateTaskAction", createStart);
const create = actions.slice(createStart, createEnd);
assert.match(create, /task: createdTask,/);
assert.match(helper, /postType: "post"/);
assert.match(helper, /internalPreviewType: "task"/);
assert.match(helper, /internalPreviewId: taskId/);
assert.match(helper, /getFeedByHandle\(circle\._id\.toString\(\), "default"\)/);

console.log("task reference-integrity call-graph tests passed");
