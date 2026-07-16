import assert from "node:assert/strict";
import {
    buildOutcomeTaskCompletionUpdate,
    getOutcomeTaskCompletionPlan,
    type OutcomeTaskCompletionPermissions,
} from "./task-completion-policy";

const ordinaryUser: OutcomeTaskCompletionPermissions = {
    isAuthor: false,
    canAssign: false,
    canResolve: false,
    canModerate: false,
};

const moderator: OutcomeTaskCompletionPermissions = {
    isAuthor: false,
    canAssign: false,
    canResolve: false,
    canModerate: true,
};

const authorOnly: OutcomeTaskCompletionPermissions = {
    isAuthor: true,
    canAssign: false,
    canResolve: false,
    canModerate: false,
};

const activeUnassignedOutcomeTask = {
    stage: "open",
    taskType: "outcome",
} as const;

assert.deepEqual(
    getOutcomeTaskCompletionPlan(activeUnassignedOutcomeTask, moderator),
    { allowed: true, mode: "unassigned-operational-completion" },
    "authorized moderators can complete unassigned outcome tasks",
);

assert.deepEqual(
    buildOutcomeTaskCompletionUpdate("did:example:moderator", new Date("2026-07-16T10:00:00.000Z")),
    {
        stage: "resolved",
        resolvedAt: new Date("2026-07-16T10:00:00.000Z"),
        verifiedAt: new Date("2026-07-16T10:00:00.000Z"),
        verifiedBy: "did:example:moderator",
    },
    "the actual admin/moderator DID is saved as the verifier",
);

assert.equal(
    Object.hasOwn(
        buildOutcomeTaskCompletionUpdate("did:example:moderator", new Date("2026-07-16T10:00:00.000Z")),
        "assignedTo",
    ),
    false,
    "unassigned operational completion does not add or require assignedTo",
);

assert.deepEqual(
    getOutcomeTaskCompletionPlan(activeUnassignedOutcomeTask, ordinaryUser),
    { allowed: false, reason: "Not authorized to complete this task" },
    "ordinary users cannot complete unassigned outcome tasks",
);

assert.deepEqual(
    getOutcomeTaskCompletionPlan(
        {
            stage: "inProgress",
            taskType: "outcome",
            assignedTo: "did:example:assignee",
        },
        moderator,
    ),
    { allowed: false, reason: "Task must be submitted for review before it can be verified" },
    "assigned tasks still require submission before verification",
);

assert.deepEqual(
    getOutcomeTaskCompletionPlan(
        {
            stage: "inProgress",
            taskType: "outcome",
            assignedTo: "did:example:assignee",
            submittedForReviewAt: new Date("2026-07-16T10:00:00.000Z"),
        },
        authorOnly,
    ),
    { allowed: true, mode: "assigned-verification" },
    "existing assigned-task verification remains allowed after submission",
);

assert.deepEqual(
    getOutcomeTaskCompletionPlan(
        {
            stage: "resolved",
            taskType: "outcome",
            assignedTo: "did:example:assignee",
            verifiedAt: new Date("2026-07-16T10:00:00.000Z"),
        },
        ordinaryUser,
    ),
    { allowed: false, reason: "Not authorized to verify this task" },
    "unauthorized callers do not receive idempotent success for already completed assigned tasks",
);

assert.deepEqual(
    getOutcomeTaskCompletionPlan(
        {
            stage: "resolved",
            taskType: "outcome",
            verifiedAt: new Date("2026-07-16T10:00:00.000Z"),
        },
        ordinaryUser,
    ),
    { allowed: false, reason: "Not authorized to complete this task" },
    "unauthorized callers do not receive idempotent success for already completed unassigned tasks",
);

assert.deepEqual(
    getOutcomeTaskCompletionPlan(
        {
            stage: "open",
            taskType: "shift",
        },
        moderator,
    ),
    { allowed: false, reason: "Shift tasks are verified per participant" },
    "shift tasks remain excluded from outcome completion",
);

assert.deepEqual(
    getOutcomeTaskCompletionPlan(
        {
            stage: "resolved",
            taskType: "outcome",
            assignedTo: "did:example:assignee",
            verifiedAt: new Date("2026-07-16T10:00:00.000Z"),
        },
        authorOnly,
    ),
    { allowed: true, mode: "already-completed" },
    "authorized assigned-task reviewers keep idempotent success for already verified tasks",
);

assert.deepEqual(
    getOutcomeTaskCompletionPlan(
        {
            stage: "resolved",
            taskType: "outcome",
            verifiedAt: new Date("2026-07-16T10:00:00.000Z"),
        },
        moderator,
    ),
    { allowed: true, mode: "already-completed" },
    "already verified tasks return an idempotent completion plan",
);

console.log("task-completion-policy tests passed");
