import assert from "node:assert/strict";
import test from "node:test";
import { ObjectId } from "mongodb";
import { isTaskBoundToRouteCircle } from "./task-read-policy";

test("direct task reads require the task's canonical source to match the route Circle", () => {
    const ownerId = new ObjectId();
    const otherId = new ObjectId();
    assert.equal(isTaskBoundToRouteCircle({ circleId: ownerId.toString() }, { _id: ownerId } as any), true);
    assert.equal(isTaskBoundToRouteCircle({ circleId: ownerId.toString() }, { _id: otherId } as any), false);
    assert.equal(isTaskBoundToRouteCircle({ circleId: "malformed" }, { _id: ownerId } as any), false);
    assert.equal(isTaskBoundToRouteCircle({ circleId: ownerId.toString() }, { _id: "malformed" } as any), false);
    assert.equal(isTaskBoundToRouteCircle(null, { _id: ownerId } as any), false);
    assert.equal(isTaskBoundToRouteCircle({ circleId: ownerId.toString() }, null), false);
});

test("real contribution/profile boundary excludes private sources and keeps totals viewer-independent", async () => {
    process.env.IS_BUILD = "true";
    const { getProfileContributionPanelData } = await import(
        "../../app/circles/[handle]/home/profile-contribution-panel-data"
    );
    const { runWithTaskReadBoundaryOverrides } = await import("./task-read-policy");

    const profileDid = "did:example:profile";
    const publicId = new ObjectId();
    const restrictedId = new ObjectId();
    const secretId = new ObjectId();
    const pausedId = new ObjectId();
    const suspendedId = new ObjectId();
    const removedId = new ObjectId();
    const missingId = new ObjectId();
    const secretVerificationTimestamp = new Date("2026-01-02T03:04:05.000Z");
    const secretAttendanceTimestamp = new Date("2026-01-04T05:06:07.000Z");
    const outcome = (id: string, circleId: ObjectId | string, overrides: Record<string, unknown> = {}) => ({
        _id: id,
        circleId: circleId.toString(),
        taskType: "outcome",
        title: id,
        assignedTo: profileDid,
        stage: "resolved",
        verifiedAt: new Date("2026-01-01T00:00:00.000Z"),
        verifiedBy: "did:example:verifier",
        ...overrides,
    });
    const shift = (id: string, circleId: ObjectId, participant: Record<string, unknown>) => ({
        _id: id,
        circleId: circleId.toString(),
        taskType: "shift",
        title: typeof participant.title === "string" ? participant.title : id,
        participants: [{ userDid: profileDid, ...participant }],
        verifiedAt: participant.attendanceVerifiedAt,
        contributionNote: participant.attendanceNote,
    });
    const tasks = [
        outcome("public-task", publicId),
        outcome("restricted-public-task", restrictedId),
        outcome("secret-task-id", secretId, {
            title: "Secret task title",
            verifiedAt: secretVerificationTimestamp,
            contributionNote: "Secret attendance note",
        }),
        shift("public-shift", publicId, {
            attendanceStatus: "attended",
            attendanceVerifiedAt: new Date("2026-01-03T00:00:00.000Z"),
        }),
        shift("secret-shift-id", secretId, {
            title: "Secret shift title",
            attendanceStatus: "attended",
            attendanceVerifiedAt: secretAttendanceTimestamp,
            attendanceNote: "Secret shift note",
        }),
        outcome("paused-task", pausedId),
        outcome("suspended-task", suspendedId),
        outcome("removed-task", removedId),
        outcome("missing-source-task", missingId),
        outcome("malformed-source-task", "not-an-object-id"),
        outcome("claim-only", publicId, { assignedTo: undefined, claims: [{ claimantDid: profileDid }] }),
        outcome("pending", publicId, { stage: "inProgress" }),
        outcome("creator-only", publicId, { assignedTo: undefined, createdBy: profileDid }),
        outcome("verifier-only", publicId, { assignedTo: undefined, verifiedBy: profileDid }),
        outcome("unassigned", publicId, { assignedTo: undefined }),
        outcome("missing-verified-at", publicId, { verifiedAt: null }),
        outcome("missing-verifier", publicId, { verifiedBy: null }),
        shift("signup-only", publicId, { attendanceStatus: "signed_up" }),
        shift("confirmation-only", publicId, { attendanceStatus: "confirmed" }),
        shift("did-not-attend", publicId, {
            attendanceStatus: "did_not_attend",
            attendanceVerifiedAt: new Date(),
        }),
        shift("other-participant", publicId, {
            userDid: "did:example:other",
            attendanceStatus: "attended",
            attendanceVerifiedAt: new Date(),
        }),
    ] as any[];
    const circles = [
        { _id: publicId, circleType: "circle", visibility: "public", moderationStatus: "active", name: "Public" },
        {
            _id: restrictedId,
            circleType: "project",
            visibility: "public",
            moderationStatus: "active",
            name: "Restricted Public",
        },
        {
            _id: secretId,
            circleType: "circle",
            visibility: "secret",
            moderationStatus: "active",
            name: "Secret Circle name",
            handle: "secret-handle",
            picture: "secret-picture",
        },
        { _id: pausedId, circleType: "circle", visibility: "public", moderationStatus: "paused", name: "Paused" },
        { _id: suspendedId, circleType: "circle", visibility: "public", moderationStatus: "suspended" },
        { _id: removedId, circleType: "circle", visibility: "public", moderationStatus: "removed" },
    ] as any[];

    const viewers = [undefined, "did:example:outsider", "did:example:contact", profileDid, "did:example:secret-member"];
    const results = [];
    let contributionAggregateCalls = 0;
    let contributionSourceBatchCalls = 0;
    for (const viewerDid of viewers) {
        results.push(
            await runWithTaskReadBoundaryOverrides(
                {
                    aggregateContributionTasks: async () => {
                        contributionAggregateCalls += 1;
                        return tasks;
                    },
                    findSourceCircles: async (ids) => {
                        contributionSourceBatchCalls += 1;
                        return circles.filter((circle) => ids.includes(circle._id.toString()));
                    },
                    findViewerMemberships: async (did) =>
                        did === "did:example:secret-member"
                            ? ([{ userDid: did, circleId: secretId.toString(), userGroups: ["members"] }] as any)
                            : did === "did:example:contact"
                              ? ([{ userDid: did, circleId: publicId.toString(), userGroups: ["contacts"] }] as any)
                              : [],
                    authorizeTaskModule: async (did, circleId) =>
                        !(did === "did:example:outsider" && circleId === restrictedId.toString()),
                },
                () =>
                    getProfileContributionPanelData(profileDid, viewerDid, {
                        authorize: async () => true,
                    }),
            ),
        );
    }

    assert.deepEqual(
        results.map((result) => result.totalPublicCount),
        [4, 4, 4, 4, 4],
    );
    assert.equal(results[0].items.length, 4);
    assert.equal(results[1].items.length, 3, "viewer module policy can reduce rows without changing total");
    assert.equal(contributionAggregateCalls, viewers.length);
    assert.equal(
        contributionSourceBatchCalls,
        viewers.length,
        "each profile request batch-loads contribution sources once",
    );
    assert.deepEqual(results[0].items.map((item) => item.task._id).sort(), [
        "paused-task",
        "public-shift",
        "public-task",
        "restricted-public-task",
    ]);
    const serialized = JSON.stringify(results);
    for (const publicValue of ["public-task", "public-shift", publicId.toString(), "Public"]) {
        assert.equal(serialized.includes(publicValue), true, `serialized panel data omitted ${publicValue}`);
    }
    for (const secretValue of [
        "secret-task-id",
        "Secret task title",
        "secret-shift-id",
        "Secret shift title",
        "Secret Circle name",
        "secret-handle",
        "secret-picture",
        secretId.toString(),
        secretVerificationTimestamp.toISOString(),
        secretAttendanceTimestamp.toISOString(),
        "Secret attendance note",
        "Secret shift note",
    ]) {
        assert.equal(serialized.includes(secretValue), false, `serialized profile payload leaked ${secretValue}`);
    }
});

test("real task viewer filter enforces source policy and batches source, membership, and module reads", async () => {
    process.env.IS_BUILD = "true";
    const { filterTasksForViewer } = await import("./task");
    const { runWithTaskReadBoundaryOverrides } = await import("./task-read-policy");
    const publicId = new ObjectId();
    const secondPublicId = new ObjectId();
    const secretId = new ObjectId();
    const userSourceId = new ObjectId();
    const suspendedId = new ObjectId();
    const removedId = new ObjectId();
    const missingId = new ObjectId();
    const circles = [
        { _id: publicId, circleType: "circle", visibility: "public", moderationStatus: "active" },
        { _id: secondPublicId, circleType: "project", visibility: undefined, moderationStatus: undefined },
        { _id: secretId, circleType: "circle", visibility: "secret", moderationStatus: "active" },
        { _id: userSourceId, circleType: "user", visibility: "public", moderationStatus: "active" },
        { _id: suspendedId, circleType: "circle", visibility: "public", moderationStatus: "suspended" },
        { _id: removedId, circleType: "circle", visibility: "public", moderationStatus: "removed" },
    ] as any[];
    const tasks = [
        ...Array.from({ length: 8 }, (_, index) => ({ _id: `public-${index}`, circleId: publicId.toString() })),
        { _id: "second-public", circleId: secondPublicId.toString() },
        { _id: "secret-allowed", circleId: secretId.toString(), userGroups: ["members"] },
        { _id: "secret-group-denied", circleId: secretId.toString(), userGroups: ["admins"] },
        { _id: "user-source", circleId: userSourceId.toString() },
        { _id: "suspended", circleId: suspendedId.toString() },
        { _id: "removed", circleId: removedId.toString() },
        { _id: "missing", circleId: missingId.toString() },
        { _id: "malformed", circleId: "bad" },
    ] as any[];
    let sourceLoads = 0;
    let membershipLoads = 0;
    const authorizationCalls = new Map<string, number>();
    Object.defineProperty(tasks.find((task) => task._id === "user-source")!, "userGroups", {
        get: () => {
            throw new Error("user-source task reached user-group authorization");
        },
    });
    const run = (viewerDid: string, denySecretModule = false) =>
        runWithTaskReadBoundaryOverrides(
            {
                findSourceCircles: async () => {
                    sourceLoads += 1;
                    return circles;
                },
                findViewerMemberships: async (did) => {
                    membershipLoads += 1;
                    return did === "did:example:member"
                        ? ([{ userDid: did, circleId: secretId.toString(), userGroups: ["members"] }] as any)
                        : [];
                },
                authorizeTaskModule: async (_did, circleId) => {
                    authorizationCalls.set(circleId, (authorizationCalls.get(circleId) ?? 0) + 1);
                    return !(denySecretModule && circleId === secretId.toString());
                },
            },
            () => filterTasksForViewer(tasks, viewerDid),
        );

    const outsider = await run("did:example:outsider");
    assert.equal(
        outsider.some((task) => task._id === "secret-allowed"),
        false,
    );
    const member = await run("did:example:member");
    assert.equal(
        member.some((task) => task._id === "secret-allowed"),
        true,
    );
    assert.equal(
        member.some((task) => task._id === "secret-group-denied"),
        false,
    );
    assert.equal(
        member.some((task) => task._id === "user-source"),
        false,
    );
    assert.equal(member.filter((task) => String(task._id).startsWith("public-")).length, 8);
    assert.equal(
        member.some((task) => ["suspended", "removed", "missing", "malformed"].includes(String(task._id))),
        false,
    );
    const moduleDeniedMember = await run("did:example:member", true);
    assert.equal(
        moduleDeniedMember.some((task) => task._id === "secret-allowed"),
        false,
    );
    assert.equal(
        moduleDeniedMember.some((task) => task._id === "secret-group-denied"),
        false,
    );
    assert.equal(sourceLoads, 3, "exactly one Circle batch load per filter invocation");
    assert.equal(membershipLoads, 3, "exactly one membership batch load per authenticated viewer");
    assert.equal(
        authorizationCalls.get(publicId.toString()),
        3,
        "shared public source is authorized once per invocation",
    );
    assert.equal(authorizationCalls.get(secondPublicId.toString()), 3);
    assert.equal(
        authorizationCalls.get(secretId.toString()),
        2,
        "Secret outsider is rejected before module authorization; both member runs reach it once",
    );
    assert.equal(authorizationCalls.has(userSourceId.toString()), false, "user source is rejected before modules");
    assert.equal(authorizationCalls.has(suspendedId.toString()), false, "suspended source is rejected before modules");
    assert.equal(authorizationCalls.has(removedId.toString()), false, "removed source is rejected before modules");
});

test("real getTaskAction binds route ownership and returns neutral null for every denied form", async () => {
    process.env.IS_BUILD = "true";
    const { getTaskAction } = await import("../../app/circles/[handle]/tasks/actions");
    const { runWithTaskReadBoundaryOverrides } = await import("./task-read-policy");
    const publicCircle = { _id: new ObjectId(), handle: "public", circleType: "circle" } as any;
    const wrongCircle = { _id: new ObjectId(), handle: "wrong", circleType: "circle" } as any;
    const secretCircle = { _id: new ObjectId(), handle: "secret", circleType: "circle", visibility: "secret" } as any;
    const suspendedCircle = {
        _id: new ObjectId(),
        handle: "suspended",
        circleType: "circle",
        moderationStatus: "suspended",
    } as any;
    const removedCircle = {
        _id: new ObjectId(),
        handle: "removed",
        circleType: "circle",
        moderationStatus: "removed",
    } as any;
    const missingSourceCircle = { _id: new ObjectId(), handle: "missing-source", circleType: "circle" } as any;
    const userSource = { _id: new ObjectId(), handle: "user-source", circleType: "user" } as any;
    const malformedSource = { _id: "malformed", handle: "malformed-source", circleType: "circle" } as any;
    const publicTask = { _id: "public-task", circleId: publicCircle._id.toString(), title: "Public" } as any;
    const secretTask = { _id: "secret-task", circleId: secretCircle._id.toString(), title: "Secret" } as any;
    const suspendedTask = { _id: "suspended-task", circleId: suspendedCircle._id.toString() } as any;
    const removedTask = { _id: "removed-task", circleId: removedCircle._id.toString() } as any;
    const missingSourceTask = { _id: "missing-source-task", circleId: missingSourceCircle._id.toString() } as any;
    const userSourceTask = { _id: "user-source-task", circleId: userSource._id.toString() } as any;
    const malformedSourceTask = { _id: "malformed-source-task", circleId: "malformed" } as any;
    const circlesByHandle = new Map([
        ["public", publicCircle],
        ["wrong", wrongCircle],
        ["secret", secretCircle],
        ["suspended", suspendedCircle],
        ["removed", removedCircle],
        ["missing-source", missingSourceCircle],
        ["user-source", userSource],
        ["malformed-source", malformedSource],
    ]);
    const tasksById = new Map([
        ["public-task", publicTask],
        ["secret-task", secretTask],
        ["suspended-task", suspendedTask],
        ["removed-task", removedTask],
        ["missing-source-task", missingSourceTask],
        ["user-source-task", userSourceTask],
        ["malformed-source-task", malformedSourceTask],
    ]);
    const sourceCircles = [publicCircle, wrongCircle, secretCircle, suspendedCircle, removedCircle, userSource];
    const invoke = (
        handle: string,
        taskId: string,
        viewerDid = "did:example:member",
        availableSources = sourceCircles,
    ) =>
        runWithTaskReadBoundaryOverrides(
            {
                getAuthenticatedUserDid: async () => viewerDid,
                getCircleByHandle: async (value) => circlesByHandle.get(value) ?? null,
                getTaskById: async (value) => tasksById.get(value) ?? null,
                findSourceCircles: async (ids) =>
                    availableSources.filter(
                        (circle) => ObjectId.isValid(circle._id) && ids.includes(circle._id.toString()),
                    ),
                findViewerMemberships: async (did) =>
                    did === "did:example:member"
                        ? ([{ userDid: did, circleId: secretCircle._id.toString(), userGroups: ["members"] }] as any)
                        : [],
                authorizeTaskModule: async () => true,
            },
            () => getTaskAction(handle, taskId),
        );

    assert.equal(await invoke("public", "public-task"), publicTask);
    assert.equal(await invoke("secret", "secret-task"), secretTask);
    const denied = await Promise.all([
        invoke("secret", "secret-task", "did:example:outsider"),
        invoke("public", "secret-task"),
        invoke("wrong", "public-task"),
        invoke("public", "missing-task"),
        invoke("public", "malformed-task-id"),
        invoke("suspended", "suspended-task"),
        invoke("removed", "removed-task"),
        invoke("missing-source", "missing-source-task", "did:example:member", []),
        invoke("user-source", "user-source-task"),
        invoke("malformed-source", "malformed-source-task"),
    ]);
    assert.deepEqual(denied, Array(denied.length).fill(null));
});
