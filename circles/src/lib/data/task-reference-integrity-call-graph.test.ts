import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const actions = readFileSync("src/app/circles/[handle]/tasks/actions.ts", "utf8");
const start = actions.indexOf("export async function updateTaskAction");
const end = actions.indexOf("export async function updateTaskPriorityAction", start);
assert.ok(start >= 0 && end > start);
const update = actions.slice(start, end);

const gate = update.indexOf("resolveTaskUpdateOwnership(");
assert.ok(gate >= 0, "updateTaskAction must use canonical Task ownership gate");
for (const operation of [
    "getCircleById(",
    "assertCircleWritesAllowed(",
    "saveFile(",
    "deleteFile(",
    "updateTask(",
    "upsertShiftNoticeboardPost(",
    "revalidatePath(",
]) {
    assert.ok(update.indexOf(operation) > gate, `${operation} must remain downstream of ownership gate`);
}
assert.match(update, /const targetCircle = sourceCircle;/);
assert.match(update, /circleId: sourceCircleId,/);
assert.match(update, /canReadCircle\(userDid, sourceCircle\)/);
assert.doesNotMatch(update, /getCircleById\(requested/);
assert.doesNotMatch(update, /didTargetCircleChange|canCreateInTarget|move tasks/);

console.log("task reference-integrity call-graph tests passed");
