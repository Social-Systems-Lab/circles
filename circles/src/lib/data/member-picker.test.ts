import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
// @ts-expect-error Bun's runtime mock API is available when this test is run with `bun test`.
import { mock } from "bun:test";
import { ObjectId } from "mongodb";

const taskFeature = { handle: "assign", module: "tasks", defaultUserGroups: ["admins"] } as any;
const issueFeature = { handle: "assign", module: "issues", defaultUserGroups: ["admins"] } as any;
const circleId = new ObjectId().toString();
const otherCircleId = new ObjectId().toString();

const state = {
    circleExists: true,
    member: true,
    authorized: true,
    status: "active",
    aggregateReads: 0,
    lastPipeline: [] as any[],
};

const rawMember = {
    _id: "PRIVATE_MEMBERSHIP_ID",
    circleId: "PRIVATE_CIRCLE_ID",
    userDid: "did:member",
    did: "PRIVATE_DUPLICATE_DID",
    name: "Safe Member",
    handle: "PRIVATE_HANDLE",
    userGroups: ["admins"],
    joinedAt: new Date(),
    description: "PRIVATE_DESCRIPTION",
    images: ["PRIVATE_IMAGES"],
    location: { street: "PRIVATE_STREET", lngLat: [1, 2] },
    members: 99,
    circleType: "user",
    metrics: { rank: 1 },
    email: "PRIVATE_EMAIL",
    metadata: { secret: true },
    questionnaireAnswers: { secret: true },
    futureSecret: "PRIVATE_FUTURE_FIELD",
    picture: { url: "https://example.test/member.png", originalName: "PRIVATE_PICTURE_FIELD" },
};

mock.module("server-only", () => ({}));
mock.module("@/lib/auth/auth", () => ({
    isAuthorized: async (_viewerDid: string, _circleId: string, feature: any) =>
        state.authorized && state.status === "active" && feature.handle === "assign",
}));
mock.module("@/lib/data/db", () => ({
    Circles: {
        findOne: async ({ _id }: { _id: ObjectId }) =>
            state.circleExists && _id.toString() === circleId
                ? { _id, circleType: "circle", moderationStatus: state.status }
                : null,
    },
    Members: {
        findOne: async ({ circleId: targetCircleId }: { circleId: string }) =>
            state.member && targetCircleId === circleId ? { _id: "membership" } : null,
        aggregate: (pipeline: any[]) => {
            state.aggregateReads++;
            state.lastPipeline = pipeline;
            return { toArray: async () => [rawMember, { userDid: "did:no-picture", name: "No Picture" }] };
        },
    },
}));

const { getAuthorizedMemberPickerResult } = await import("./member-picker");

const reset = () => {
    state.circleExists = true;
    state.member = true;
    state.authorized = true;
    state.status = "active";
    state.aggregateReads = 0;
    state.lastPipeline = [];
};

const denied = { success: false, message: "Member list unavailable", members: [] };

test("unauthenticated task and issue picker requests are neutrally denied", async () => {
    reset();
    assert.deepEqual(
        await getAuthorizedMemberPickerResult({ viewerDid: undefined, circleId, requiredFeature: taskFeature }),
        denied,
    );
    assert.deepEqual(
        await getAuthorizedMemberPickerResult({ viewerDid: undefined, circleId, requiredFeature: issueFeature }),
        denied,
    );
    assert.equal(state.aggregateReads, 0);
});

test("nonmember, unauthorized member, everyone rule, and arbitrary target circle are denied", async () => {
    reset();
    state.member = false;
    assert.deepEqual(
        await getAuthorizedMemberPickerResult({ viewerDid: "did:viewer", circleId, requiredFeature: taskFeature }),
        denied,
    );

    reset();
    state.authorized = false;
    assert.deepEqual(
        await getAuthorizedMemberPickerResult({ viewerDid: "did:viewer", circleId, requiredFeature: taskFeature }),
        denied,
    );
    assert.deepEqual(
        await getAuthorizedMemberPickerResult({ viewerDid: "did:viewer", circleId, requiredFeature: issueFeature }),
        denied,
    );

    reset();
    state.member = false;
    state.authorized = true; // Models an access rule containing "everyone".
    assert.deepEqual(
        await getAuthorizedMemberPickerResult({ viewerDid: "did:viewer", circleId, requiredFeature: taskFeature }),
        denied,
    );

    reset();
    assert.deepEqual(
        await getAuthorizedMemberPickerResult({
            viewerDid: "did:viewer",
            circleId: otherCircleId,
            requiredFeature: taskFeature,
        }),
        denied,
    );
    assert.equal(state.aggregateReads, 0);
});

test("authorized task and issue assigners succeed only for active circles", async () => {
    for (const requiredFeature of [taskFeature, issueFeature]) {
        reset();
        assert.equal(
            (await getAuthorizedMemberPickerResult({ viewerDid: "did:viewer", circleId, requiredFeature })).success,
            true,
        );
    }

    for (const status of ["paused", "suspended", "removed"]) {
        reset();
        state.status = status;
        assert.deepEqual(
            await getAuthorizedMemberPickerResult({ viewerDid: "did:viewer", circleId, requiredFeature: taskFeature }),
            denied,
        );
        assert.equal(state.aggregateReads, 0);
    }
});

test("missing and hidden/unpublished nonmember circles have the same neutral result", async () => {
    reset();
    state.circleExists = false;
    const missing = await getAuthorizedMemberPickerResult({
        viewerDid: "did:viewer",
        circleId,
        requiredFeature: taskFeature,
    });
    reset();
    state.member = false;
    const hidden = await getAuthorizedMemberPickerResult({
        viewerDid: "did:viewer",
        circleId,
        requiredFeature: taskFeature,
    });
    assert.deepEqual(missing, hidden);
    assert.deepEqual(hidden, denied);
    assert.equal(JSON.stringify(hidden).includes("count"), false);
});

test("member picker returns the exact DTO keys and uses a narrow database projection", async () => {
    reset();
    const result = await getAuthorizedMemberPickerResult({
        viewerDid: "did:viewer",
        circleId,
        requiredFeature: taskFeature,
    });
    assert.deepEqual(result, {
        success: true,
        members: [
            { userDid: "did:member", name: "Safe Member", picture: { url: "https://example.test/member.png" } },
            { userDid: "did:no-picture", name: "No Picture" },
        ],
    });
    assert.deepEqual(Object.keys(result.members[0]).sort(), ["name", "picture", "userDid"]);
    assert.deepEqual(Object.keys(result.members[0].picture!).sort(), ["url"]);
    assert.deepEqual(Object.keys(result.members[1]).sort(), ["name", "userDid"]);
    const projection = state.lastPipeline.at(-1).$project;
    assert.deepEqual(projection, {
        _id: 0,
        userDid: 1,
        name: "$userDetails.name",
        "picture.url": "$userDetails.picture.url",
    });
    for (const secret of [
        "PRIVATE_MEMBERSHIP_ID",
        "PRIVATE_HANDLE",
        "PRIVATE_STREET",
        "PRIVATE_EMAIL",
        "PRIVATE_FUTURE_FIELD",
    ]) {
        assert.equal(JSON.stringify(result).includes(secret), false);
    }
});

test("actions and UI retain the guarded picker wiring and goals expose no member-list action", () => {
    const tasksAction = readFileSync("src/app/circles/[handle]/tasks/actions.ts", "utf8");
    const issuesAction = readFileSync("src/app/circles/[handle]/issues/actions.ts", "utf8");
    const goalsAction = readFileSync("src/app/circles/[handle]/goals/actions.ts", "utf8");
    const taskUi = readFileSync("src/components/modules/tasks/task-detail.tsx", "utf8");
    const issueUi = readFileSync("src/components/modules/issues/issue-detail.tsx", "utf8");

    assert.match(tasksAction, /requiredFeature: features\.tasks\.assign/);
    assert.match(issuesAction, /requiredFeature: features\.issues\.assign/);
    assert.doesNotMatch(goalsAction, /getMembersAction/);
    assert.match(taskUi, /permissions\.canAssign && \(assignDialogOpen \|\| pendingClaims\.length > 0\)/);
    assert.match(issueUi, /permissions\.canAssign && assignDialogOpen/);
    assert.match(taskUi, /getClaimantLabel\(claim\)/);
    assert.match(taskUi, /setMembers\(result\.members\)/);
    assert.match(issueUi, /setMembers\(result\.members\)/);
});
