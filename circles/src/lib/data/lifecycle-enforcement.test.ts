import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = (path: string) => readFileSync(path, "utf8");

const functionBody = (contents: string, functionName: string, nextFunctionName?: string) => {
    const start = contents.indexOf(functionName);
    assert.notEqual(start, -1, `${functionName} must exist`);
    const end = nextFunctionName ? contents.indexOf(nextFunctionName, start + functionName.length) : contents.length;
    assert.notEqual(end, -1, `${nextFunctionName} must follow ${functionName}`);
    return contents.slice(start, end);
};

const assertBefore = (contents: string, earlier: RegExp, later: RegExp, message: string) => {
    const earlierIndex = contents.search(earlier);
    const laterIndex = contents.search(later);
    assert.notEqual(earlierIndex, -1, `${message}: missing lifecycle guard`);
    assert.notEqual(laterIndex, -1, `${message}: missing protected operation`);
    assert.ok(earlierIndex < laterIndex, `${message}: lifecycle guard must run first`);
};

for (const path of [
    "src/lib/data/circle.ts",
    "src/lib/data/member.ts",
    "src/components/modules/home/actions.ts",
    "src/components/modules/membership-requests/actions.tsx",
    "src/app/circles/[handle]/tasks/actions.ts",
    "src/app/circles/[handle]/goals/actions.ts",
    "src/app/circles/[handle]/issues/actions.ts",
    "src/app/circles/[handle]/proposals/actions.ts",
    "src/app/circles/[handle]/events/actions.ts",
    "src/lib/data/circle-attach.ts",
    "src/lib/data/circle-detach.ts",
]) {
    assert.match(source(path), /assertCircleWritesAllowed/, `${path} must enforce lifecycle writes`);
}

const chat = source("src/components/modules/chat/mongo-actions.ts");
assert.match(chat, /intent: "read" \| "write" = "read"/);
assert.match(chat, /resolveMongoConversationAccess\(conversationId, userDid, "write"\)/);
assert.match(chat, /canReadCircleByLifecycle\(ownerCircle\)/);

const contactCircleAdmins = functionBody(chat, "contactCircleAdminsAction", "getUnreadCountsAction");
assertBefore(
    contactCircleAdmins,
    /assertCircleWritesAllowed\(circleId\)/,
    /Members\.find\(\{ circleId, userGroups: "admins" \}/,
    "circle contact admin lookup",
);
for (const protectedWrite of [
    /ChatConversations\.updateOne/,
    /createConversation\(/,
    /ChatRoomMembers\.updateOne/,
    /createMessage\(/,
    /sendConversationMessageNotifications\(/,
]) {
    assertBefore(contactCircleAdmins, /assertCircleWritesAllowed\(circleId\)/, protectedWrite, "circle contact write");
}

const tasks = source("src/app/circles/[handle]/tasks/actions.ts");
const guardedTaskFunctions = [
    ["updateTaskAction", "updateTaskPriorityAction", /const isAuthor/],
    ["deleteTaskAction", "acceptTaskAction", /const isAuthor/],
    ["requestTaskChangesAction", "submitTaskClaimAction", /const isAuthor/],
    ["verifyTaskCompletionAction", "joinShiftTaskAction", /const isAuthor/],
    ["changeTaskStageAction", "assignTaskAction", /const isAssignee/],
] as const;
for (const [functionName, nextFunctionName, authorizationException] of guardedTaskFunctions) {
    const body = functionBody(tasks, functionName, nextFunctionName);
    assertBefore(body, /assertCircleWritesAllowed/, authorizationException, functionName);
}

const updateTaskBody = functionBody(tasks, "updateTaskAction", "updateTaskPriorityAction");
assert.match(updateTaskBody, /assertCircleWritesAllowed\(sourceCircle\._id as string\)/);
assert.match(updateTaskBody, /assertCircleWritesAllowed\(targetCircle\._id as string\)/);
for (const sideEffect of [/saveFile\(/, /deleteFile\(/, /updateTask\(/, /upsertShiftNoticeboardPost\(/]) {
    assertBefore(updateTaskBody, /await Promise\.all\(\[\s*assertCircleWritesAllowed/, sideEffect, "task move preflight");
}

const rankingInvalidation = functionBody(tasks, "invalidateUserRankingsIfNeededAction", "// --- Modify existing actions");
assertBefore(
    rankingInvalidation,
    /assertCircleWritesAllowed\(circleId\)/,
    /RankedLists\.updateMany/,
    "task ranking invalidation",
);

const funding = source("src/lib/data/funding.ts");
assert.doesNotMatch(funding, /viewerCircle\?\.isAdmin/);
assert.match(funding, /canWriteCircleByLifecycle\(circle\)/);

const ranking = source("src/lib/data/ranking.ts");
assert.match(ranking, /moderationStatus: "active"/);

const circleData = source("src/lib/data/circle.ts");
const lifecycleQuery = functionBody(circleData, "getDiscoverableLifecycleQuery", "getSwipeCircles");
assert.match(lifecycleQuery, /circleType: "user"/);

console.log("lifecycle enforcement source tests passed");
