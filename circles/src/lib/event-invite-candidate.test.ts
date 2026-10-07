import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
// @ts-expect-error Bun's runtime mock API is available when this test is run with `bun test`.
import { mock } from "bun:test";
import { ObjectId } from "mongodb";

const circleId = new ObjectId().toString();
const otherCircleId = new ObjectId().toString();
const sensitiveProfile = {
    _id: "PRIVATE_ID",
    did: "did:member",
    publicKey: "PRIVATE_PUBLIC_KEY",
    name: "Member Name",
    handle: "member-handle",
    email: "PRIVATE_EMAIL",
    officialEmail: "PRIVATE_OFFICIAL_EMAIL",
    description: "PRIVATE_DESCRIPTION",
    mission: "PRIVATE_MISSION",
    location: "PRIVATE_LOCATION",
    street: "PRIVATE_STREET",
    lngLat: [1, 2],
    images: ["PRIVATE_IMAGES"],
    userGroups: ["admins"],
    accessRules: { private: true },
    metadata: { private: true },
    questionnaire: { private: true },
    bookmarkedCircles: ["PRIVATE_BOOKMARK"],
    futureSecret: "PRIVATE_FUTURE_FIELD",
    picture: { url: "https://example.test/member.png", originalName: "PRIVATE_PICTURE_FIELD" },
};

let profileProjection: unknown;

const actionState: {
    userDid: string | null;
    routeCircle: any;
    event: any;
    circles: Record<string, any>;
    memberships: Record<string, string[] | undefined>;
    lifecycle: Record<string, Lifecycle>;
    occurrenceCancelled: boolean;
    occurrenceRsvps: { userDid: string; status: "going" | "interested" | "none" }[];
    candidateQueryCalls: number;
} = {
    userDid: null,
    routeCircle: null,
    event: null,
    circles: {},
    memberships: {},
    lifecycle: {},
    occurrenceCancelled: false,
    occurrenceRsvps: [],
    candidateQueryCalls: 0,
};

const cursor = (rows: any[]) => ({
    project: () => cursor(rows),
    sort: () => cursor(rows),
    limit: () => cursor(rows),
    toArray: async () => rows,
});

mock.module("server-only", () => ({}));
mock.module("next/cache", () => ({ revalidatePath: () => undefined }));
mock.module("@/lib/auth/auth", () => ({
    getAuthenticatedUserDid: async () => actionState.userDid,
    isAuthorized: async (_did: string, id: string, feature: { handle: string }) => {
        const host = actionState.circles[id];
        const allowed =
            host?.accessRules?.events?.[feature.handle] ??
            (feature.handle === "review"
                ? ["admins", "moderators"]
                : feature.handle === "moderate"
                  ? ["admins"]
                  : ["everyone"]);
        return (
            allowed.includes("everyone") ||
            (actionState.memberships[id] ?? []).some((group: string) => allowed.includes(group))
        );
    },
}));
mock.module("@/lib/data/constants", () => ({
    features: {
        events: {
            view: {
                handle: "view",
                module: "events",
                defaultUserGroups: ["admins", "moderators", "members", "everyone"],
            },
            review: { handle: "review", module: "events", defaultUserGroups: ["admins", "moderators"] },
            moderate: { handle: "moderate", module: "events", defaultUserGroups: ["admins"] },
        },
    },
}));
mock.module("@/lib/data/db", () => ({
    Members: {
        find: () => {
            actionState.candidateQueryCalls++;
            return cursor([{ userDid: sensitiveProfile.did }]);
        },
    },
    Circles: {
        find: (_query: unknown, options: { projection: unknown }) => {
            profileProjection = options.projection;
            return { toArray: async () => [sensitiveProfile] };
        },
    },
    UserRelationships: {
        find: () => {
            actionState.candidateQueryCalls++;
            return cursor([{ toDid: sensitiveProfile.did }]);
        },
    },
    Events: {
        findOne: async (query: { _id?: ObjectId }) =>
            query._id?.toString() === actionState.event?._id?.toString() ? actionState.event : null,
    },
    EventOccurrences: {
        findOne: async () => (actionState.occurrenceCancelled ? { status: "cancelled" } : null),
    },
    EventOccurrenceRsvps: { find: () => cursor(actionState.occurrenceRsvps) },
    EventRsvps: { find: () => cursor([]) },
    EventOccurrenceInvitations: { find: () => cursor([]) },
    EventInvitations: {},
    Feeds: {},
}));

mock.module("@/lib/event-publish-capability", () => ({
    parseEventSubmitStage: (value: unknown) =>
        value === "preserve" ? "preserve" : value === "review" ? "review" : value === "open" ? "open" : "draft",
    resolveEventCreationCapability: (selectedIds: string[], hosts: any[]) => {
        const ids = Array.from(new Set(selectedIds.filter(Boolean)));
        if (ids.length === 0) return "unavailable";
        const byId = new Map(hosts.map((host) => [host._id?.toString(), host]));
        const selected = ids.map((id) => byId.get(id));
        if (selected.some((host) => !host?.canCreateEvents)) return "unavailable";
        return selected.every((host) => host?.canPublishEvents) ? "draft-or-publish" : "draft-or-review";
    },
}));
mock.module("@/lib/data/feed", () => ({
    createDefaultFeed: async () => undefined,
    createPost: async () => null,
    deletePost: async () => undefined,
    getFeedByHandle: async () => null,
    updatePost: async () => undefined,
}));
mock.module("@/lib/data/circle", () => ({
    getCircleByHandle: async () => actionState.routeCircle,
    ensureModuleIsEnabledOnCircle: async () => undefined,
    getCirclesBySearchQuery: async () => [],
    getCirclesByDids: async () => [],
    getCirclesByIds: async (ids: string[]) =>
        ids.flatMap((id) => (actionState.circles[id] ? [actionState.circles[id]] : [])),
}));
mock.module("@/lib/data/user", () => ({
    getUserByDid: async () => null,
    getUserPrivate: async () => null,
    getPrivateUserByDid: async () => null,
    updateUser: async () => undefined,
    getUserByHandle: async () => null,
}));
mock.module("@/lib/data/storage", () => ({
    saveFile: async () => null,
    deleteFile: async () => undefined,
    isFile: () => false,
}));
mock.module("@/lib/profile-completion", () => ({
    canParticipate: () => true,
    getParticipationRequiredMessage: () => "",
}));
mock.module("@/lib/data/event", () => ({
    getEventsByCircleId: async () => [],
    getEventById: async () => actionState.event,
    createEvent: async () => null,
    updateEvent: async () => null,
    deleteEvent: async () => undefined,
    changeEventStage: async () => undefined,
    normalizeEventHostCircleIds: (candidateEvent: any) =>
        Array.from(new Set([candidateEvent.circleId, ...(candidateEvent.hostCircleIds || [])].filter(Boolean))),
    canManageEvent: async (did: string, candidateEvent: any) => {
        if (candidateEvent.createdBy === did) return true;
        for (const id of new Set([candidateEvent.circleId, ...(candidateEvent.hostCircleIds || [])])) {
            const host = actionState.circles[id];
            for (const handle of ["review", "moderate"]) {
                const allowed =
                    host?.accessRules?.events?.[handle] ??
                    (handle === "review" ? ["admins", "moderators"] : ["admins"]);
                if (
                    allowed.includes("everyone") ||
                    (actionState.memberships[id] ?? []).some((group) => allowed.includes(group))
                ) {
                    return true;
                }
            }
        }
        return false;
    },
    inviteUsersToEvent: async () => undefined,
}));
mock.module("@/lib/data/eventRsvp", () => ({
    upsertRsvp: async () => undefined,
    cancelRsvp: async () => undefined,
    listAttendees: async () => [],
    listAttendeesWithDetails: async () => [],
}));
mock.module("@/lib/data/eventNotifications", () => ({
    notifyEventSubmittedForReview: async () => undefined,
    notifyEventApproved: async () => undefined,
    notifyEventStatusChanged: async () => undefined,
}));
mock.module("@/lib/data/discussion", () => ({
    addCommentToDiscussion: async () => undefined,
    getDiscussionWithComments: async () => null,
}));
mock.module("@/lib/data/task", () => ({ getTasksByEventId: async () => [] }));
mock.module("@/lib/data/notifications", () => ({
    notifyEventInvitation: async () => undefined,
    notifyEventOccurrenceInvitation: async () => undefined,
}));
mock.module("@/lib/data/eventOccurrence", () => ({ cancelEventOccurrence: async () => undefined }));
mock.module("@/lib/data/eventOccurrenceRsvp", () => ({ upsertEventOccurrenceRsvp: async () => undefined }));
mock.module("@/lib/data/eventOccurrenceInvitation", () => ({ upsertEventOccurrenceInvitation: async () => undefined }));
mock.module("@/lib/data/circle-lifecycle-policy", () => ({
    getCircleModerationStatus: (candidateCircle?: any) => candidateCircle?.moderationStatus ?? "active",
    canReadCircleByLifecycle: (candidateCircle?: any) =>
        candidateCircle?.circleType === "user" ||
        ["active", "paused"].includes(candidateCircle?.moderationStatus ?? "active"),
    canWriteCircleByLifecycle: (candidateCircle?: any) =>
        candidateCircle?.circleType === "user" || (candidateCircle?.moderationStatus ?? "active") === "active",
    canDiscoverCircleByLifecycle: (candidateCircle?: any) =>
        candidateCircle?.circleType === "user" ||
        ["active", "paused"].includes(candidateCircle?.moderationStatus ?? "active"),
    assertCircleWritesAllowed: async (circleOrId: string | any) => {
        const status =
            typeof circleOrId === "string"
                ? (actionState.lifecycle[circleOrId] ?? "active")
                : (circleOrId?.moderationStatus ?? "active");
        if (typeof circleOrId !== "string" && circleOrId?.circleType === "user") return;
        if (status !== "active") throw new Error("Circle changes are unavailable");
    },
}));
mock.module("@/lib/data/member", () => ({
    getMember: async (_did: string, id: string) =>
        actionState.memberships[id] === undefined ? null : { userGroups: actionState.memberships[id] },
}));

const { getEligibleCircleMemberEventInviteCandidates, getEligibleEventInviteCandidates } = await import(
    "./data/event-invite-candidates"
);
const { hasEventInviteCandidateAuthority, resolveEventInviteCandidateAccess } = await import(
    "./event-invite-candidate-policy"
);
const {
    getEventInviteCandidatesAction,
    getEventCircleMemberInviteCandidatesAction,
    getEventOccurrenceSeriesParticipantCandidatesAction,
} = await import("@/app/circles/[handle]/events/actions");

const circle = {
    _id: circleId,
    circleType: "circle" as const,
    publishStatus: "published" as const,
    moderationStatus: "active" as const,
};
const event = {
    circleId,
    hostCircleIds: [] as string[],
    createdBy: "did:creator",
    stage: "open" as const,
};

type Lifecycle = "active" | "paused" | "suspended" | "removed";
type TestCircle = Omit<typeof circle, "publishStatus"> & {
    publishStatus: "draft" | "pending_verification" | "published";
    accessRules?: any;
};

const neutralResult = { candidates: [], circleMemberCount: 0, canBulkInviteCircleMembers: false };
const neutralMemberResult = { candidates: [], count: 0, success: false };
const emptyOccurrenceCounts = {
    effectiveParticipants: 0,
    added: 0,
    alreadySelected: 0,
    existingOccurrenceInviteesSelectedForUpdate: 0,
    notAttending: 0,
    ineligibleOrUnavailable: 0,
};
const neutralOccurrenceResult = { success: false, candidates: [], counts: emptyOccurrenceCounts };
const occurrenceKey = Date.UTC(2026, 0, 1, 10);

const resetActionState = ({
    userDid = "did:caller",
    eventOverrides = {},
}: { userDid?: string | null; eventOverrides?: Record<string, unknown> } = {}) => {
    const primary = {
        ...circle,
        handle: "primary",
        accessRules: undefined,
    };
    const secondary = {
        ...circle,
        _id: otherCircleId,
        handle: "secondary",
        accessRules: undefined,
    };
    actionState.userDid = userDid;
    actionState.routeCircle = primary;
    actionState.event = {
        _id: new ObjectId(circleId),
        ...event,
        startAt: new Date(occurrenceKey),
        endAt: new Date(occurrenceKey + 60 * 60 * 1000),
        recurrence: { frequency: "daily", interval: 1, count: 3 },
        ...eventOverrides,
    };
    actionState.circles = { [circleId]: primary, [otherCircleId]: secondary };
    actionState.memberships = {};
    actionState.lifecycle = {};
    actionState.occurrenceCancelled = false;
    actionState.occurrenceRsvps = [{ userDid: sensitiveProfile.did, status: "going" }];
    actionState.candidateQueryCalls = 0;
};

const assertExactInviteDto = (candidate: any, extraKeys: string[] = []) => {
    assert.deepEqual(
        Object.keys(candidate).sort(),
        ["did", "handle", "inviteSourceLabel", "inviteSources", "name", "picture", ...extraKeys].sort(),
    );
    assert.deepEqual(Object.keys(candidate.picture).sort(), ["url"]);
    assert.equal(JSON.stringify(candidate).includes("PRIVATE"), false);
};

const runCandidateAction = async ({
    userDid = "did:caller",
    routeCircle = circle,
    targetEvent = event,
    memberships = {},
    hostCircles = {},
    lifecycle = {},
}: {
    userDid?: string | null;
    routeCircle?: TestCircle | null;
    targetEvent?: typeof event | null;
    memberships?: Record<string, string[] | undefined>;
    hostCircles?: Record<string, TestCircle>;
    lifecycle?: Record<string, Lifecycle>;
} = {}) => {
    const circles: Record<string, TestCircle> = {
        [circleId]: circle,
        [otherCircleId]: { ...circle, _id: otherCircleId },
        ...hostCircles,
    };
    const deps = {
        getAuthenticatedUserDid: async () => userDid,
        getRouteCircle: async () => routeCircle,
        getEvent: async () => targetEvent,
        getHostCircle: async (id: string) => circles[id] ?? null,
        getMembership: async (_did: string, id: string) =>
            memberships[id] === undefined ? null : { userGroups: memberships[id] },
        isFeatureAuthorized: async (_did: string, id: string, feature: { handle: string }) => {
            const host = circles[id];
            const allowed =
                (host?.accessRules as any)?.events?.[feature.handle] ??
                (feature.handle === "review" ? ["admins", "moderators"] : ["admins"]);
            return (
                allowed.includes("everyone") || (memberships[id] ?? []).some((group: string) => allowed.includes(group))
            );
        },
        assertHostCirclesWritable: async (candidateEvent: typeof event) => {
            for (const id of new Set([candidateEvent.circleId, ...(candidateEvent.hostCircleIds || [])])) {
                if ((lifecycle[id] ?? "active") !== "active") throw new Error("neutral lifecycle denial");
            }
        },
    };

    try {
        const access = await resolveEventInviteCandidateAccess("route", "event", deps as any);
        return access
            ? { candidates: [{ did: "did:member" }], circleMemberCount: 1, canBulkInviteCircleMembers: true }
            : neutralResult;
    } catch {
        return neutralResult;
    }
};

test("getEventInviteCandidatesAction enforces authorization, neutral counts, lifecycle, and host binding", async () => {
    resetActionState({ userDid: null });
    assert.deepEqual(await getEventInviteCandidatesAction("primary", circleId), neutralResult);
    assert.equal(actionState.candidateQueryCalls, 0);

    resetActionState();
    assert.deepEqual(await getEventInviteCandidatesAction("primary", circleId), neutralResult, "view-only nonmember");
    assert.equal(actionState.candidateQueryCalls, 0);

    for (const handle of ["review", "moderate"] as const) {
        resetActionState();
        actionState.circles[circleId].accessRules = { events: { [handle]: ["everyone"] } };
        assert.deepEqual(await getEventInviteCandidatesAction("primary", circleId), neutralResult);
        assert.equal(actionState.candidateQueryCalls, 0, `events.${handle}=everyone must not reach roster queries`);
    }

    resetActionState({ userDid: "did:creator" });
    const creatorResult = await getEventInviteCandidatesAction("primary", circleId);
    assert.deepEqual(creatorResult, {
        candidates: [
            {
                did: sensitiveProfile.did,
                name: sensitiveProfile.name,
                handle: sensitiveProfile.handle,
                picture: { url: sensitiveProfile.picture.url },
                inviteSources: ["circle_member", "contact"],
                inviteSourceLabel: "Circle member + Contact",
            },
        ],
        canBulkInviteCircleMembers: true,
        circleMemberCount: 1,
    });
    assertExactInviteDto(creatorResult.candidates[0]);

    resetActionState();
    actionState.memberships[circleId] = ["moderators"];
    assert.equal((await getEventInviteCandidatesAction("primary", circleId)).circleMemberCount, 1);

    resetActionState();
    actionState.circles[circleId].accessRules = { events: { moderate: ["event-stewards"] } };
    actionState.memberships[circleId] = ["event-stewards"];
    assert.equal((await getEventInviteCandidatesAction("primary", circleId)).circleMemberCount, 1);

    resetActionState();
    actionState.memberships[circleId] = ["members"];
    assert.deepEqual(await getEventInviteCandidatesAction("primary", circleId), neutralResult);

    resetActionState({ userDid: "did:creator" });
    actionState.routeCircle = actionState.circles[otherCircleId];
    assert.deepEqual(await getEventInviteCandidatesAction("secondary", circleId), neutralResult);

    resetActionState({ userDid: "did:creator" });
    actionState.routeCircle = null;
    assert.deepEqual(await getEventInviteCandidatesAction("missing", circleId), neutralResult);

    resetActionState({ userDid: "did:creator" });
    actionState.event = null;
    assert.deepEqual(await getEventInviteCandidatesAction("primary", circleId), neutralResult);

    resetActionState({ eventOverrides: { stage: "review" } });
    assert.deepEqual(await getEventInviteCandidatesAction("primary", circleId), neutralResult);

    for (const status of ["paused", "suspended", "removed"] as const) {
        resetActionState({ userDid: "did:creator" });
        actionState.lifecycle[circleId] = status;
        assert.deepEqual(await getEventInviteCandidatesAction("primary", circleId), neutralResult);
        assert.equal(actionState.candidateQueryCalls, 0);
    }

    resetActionState({ eventOverrides: { hostCircleIds: [otherCircleId] } });
    actionState.memberships[otherCircleId] = ["moderators"];
    assert.equal((await getEventInviteCandidatesAction("primary", circleId)).circleMemberCount, 1);
    for (const status of ["paused", "suspended", "removed"] as const) {
        resetActionState({ eventOverrides: { hostCircleIds: [otherCircleId] } });
        actionState.memberships[otherCircleId] = ["moderators"];
        actionState.lifecycle[otherCircleId] = status;
        assert.deepEqual(await getEventInviteCandidatesAction("primary", circleId), neutralResult);
    }

    resetActionState({ eventOverrides: { hostCircleIds: [otherCircleId] } });
    actionState.circles[otherCircleId].accessRules = { events: { review: ["everyone"] } };
    assert.deepEqual(await getEventInviteCandidatesAction("primary", circleId), neutralResult);
    assert.equal(actionState.candidateQueryCalls, 0);
});

test("getEventCircleMemberInviteCandidatesAction executes the same private candidate boundary", async () => {
    resetActionState({ userDid: null });
    assert.deepEqual(await getEventCircleMemberInviteCandidatesAction("primary", circleId), neutralMemberResult);

    resetActionState();
    actionState.circles[circleId].accessRules = { events: { review: ["everyone"] } };
    assert.deepEqual(await getEventCircleMemberInviteCandidatesAction("primary", circleId), neutralMemberResult);
    assert.equal(actionState.candidateQueryCalls, 0);

    resetActionState({ userDid: "did:creator" });
    const creatorResult = await getEventCircleMemberInviteCandidatesAction("primary", circleId);
    assert.deepEqual(creatorResult, {
        candidates: [
            {
                did: sensitiveProfile.did,
                name: sensitiveProfile.name,
                handle: sensitiveProfile.handle,
                picture: { url: sensitiveProfile.picture.url },
                inviteSources: ["circle_member"],
                inviteSourceLabel: "Circle member",
            },
        ],
        count: 1,
        success: true,
    });
    assertExactInviteDto(creatorResult.candidates[0]);

    for (const setup of [
        () => {
            actionState.memberships[circleId] = ["moderators"];
        },
        () => {
            actionState.circles[circleId].accessRules = { events: { moderate: ["event-stewards"] } };
            actionState.memberships[circleId] = ["event-stewards"];
        },
    ]) {
        resetActionState();
        setup();
        assert.equal((await getEventCircleMemberInviteCandidatesAction("primary", circleId)).success, true);
    }

    resetActionState();
    actionState.memberships[circleId] = ["members"];
    assert.deepEqual(await getEventCircleMemberInviteCandidatesAction("primary", circleId), neutralMemberResult);

    resetActionState({ userDid: "did:creator" });
    actionState.routeCircle = actionState.circles[otherCircleId];
    assert.deepEqual(await getEventCircleMemberInviteCandidatesAction("secondary", circleId), neutralMemberResult);

    for (const status of ["paused", "suspended", "removed"] as const) {
        resetActionState({ userDid: "did:creator" });
        actionState.lifecycle[circleId] = status;
        assert.deepEqual(await getEventCircleMemberInviteCandidatesAction("primary", circleId), neutralMemberResult);
    }

    for (const status of ["paused", "suspended", "removed"] as const) {
        resetActionState({ eventOverrides: { hostCircleIds: [otherCircleId] } });
        actionState.memberships[otherCircleId] = ["moderators"];
        actionState.lifecycle[otherCircleId] = status;
        assert.deepEqual(await getEventCircleMemberInviteCandidatesAction("primary", circleId), neutralMemberResult);
    }
});

test("getEventOccurrenceSeriesParticipantCandidatesAction validates the real occurrence path", async () => {
    resetActionState({ userDid: null });
    assert.deepEqual(
        await getEventOccurrenceSeriesParticipantCandidatesAction("primary", circleId, occurrenceKey),
        neutralOccurrenceResult,
    );

    resetActionState();
    assert.deepEqual(
        await getEventOccurrenceSeriesParticipantCandidatesAction("primary", circleId, occurrenceKey),
        neutralOccurrenceResult,
    );

    for (const handle of ["review", "moderate"] as const) {
        resetActionState();
        actionState.circles[circleId].accessRules = { events: { [handle]: ["everyone"] } };
        assert.deepEqual(
            await getEventOccurrenceSeriesParticipantCandidatesAction("primary", circleId, occurrenceKey),
            neutralOccurrenceResult,
        );
        assert.equal(actionState.candidateQueryCalls, 0);
    }

    resetActionState({ userDid: "did:creator" });
    const creatorResult = await getEventOccurrenceSeriesParticipantCandidatesAction("primary", circleId, occurrenceKey);
    assert.deepEqual(creatorResult, {
        success: true,
        candidates: [
            {
                did: sensitiveProfile.did,
                name: sensitiveProfile.name,
                handle: sensitiveProfile.handle,
                picture: { url: sensitiveProfile.picture.url },
                inviteSources: ["circle_member", "contact"],
                inviteSourceLabel: "Circle member + Contact",
                effectiveOccurrenceRsvpStatus: "going",
            },
        ],
        counts: {
            effectiveParticipants: 1,
            added: 1,
            alreadySelected: 0,
            existingOccurrenceInviteesSelectedForUpdate: 0,
            notAttending: 0,
            ineligibleOrUnavailable: 0,
        },
    });
    assertExactInviteDto(creatorResult.candidates[0], ["effectiveOccurrenceRsvpStatus"]);

    for (const setup of [
        () => {
            actionState.memberships[circleId] = ["moderators"];
        },
        () => {
            actionState.circles[circleId].accessRules = { events: { moderate: ["event-stewards"] } };
            actionState.memberships[circleId] = ["event-stewards"];
        },
    ]) {
        resetActionState();
        setup();
        assert.equal(
            (await getEventOccurrenceSeriesParticipantCandidatesAction("primary", circleId, occurrenceKey)).success,
            true,
        );
    }

    resetActionState();
    actionState.memberships[circleId] = ["members"];
    assert.deepEqual(
        await getEventOccurrenceSeriesParticipantCandidatesAction("primary", circleId, occurrenceKey),
        neutralOccurrenceResult,
    );

    resetActionState({ userDid: "did:creator" });
    actionState.routeCircle = actionState.circles[otherCircleId];
    assert.deepEqual(
        await getEventOccurrenceSeriesParticipantCandidatesAction("secondary", circleId, occurrenceKey),
        neutralOccurrenceResult,
    );

    resetActionState({ userDid: "did:creator" });
    assert.deepEqual(
        await getEventOccurrenceSeriesParticipantCandidatesAction("primary", otherCircleId, occurrenceKey),
        neutralOccurrenceResult,
        "series ID must resolve the same parent event",
    );

    for (const invalidKey of [Number.NaN, occurrenceKey + 12 * 60 * 60 * 1000]) {
        resetActionState({ userDid: "did:creator" });
        assert.deepEqual(
            await getEventOccurrenceSeriesParticipantCandidatesAction("primary", circleId, invalidKey),
            neutralOccurrenceResult,
        );
    }

    resetActionState({ userDid: "did:creator" });
    actionState.occurrenceCancelled = true;
    assert.deepEqual(
        await getEventOccurrenceSeriesParticipantCandidatesAction("primary", circleId, occurrenceKey),
        neutralOccurrenceResult,
    );

    resetActionState({ userDid: "did:creator", eventOverrides: { stage: "review" } });
    assert.deepEqual(
        await getEventOccurrenceSeriesParticipantCandidatesAction("primary", circleId, occurrenceKey),
        neutralOccurrenceResult,
    );

    for (const status of ["paused", "suspended", "removed"] as const) {
        resetActionState({ userDid: "did:creator" });
        actionState.lifecycle[circleId] = status;
        assert.deepEqual(
            await getEventOccurrenceSeriesParticipantCandidatesAction("primary", circleId, occurrenceKey),
            neutralOccurrenceResult,
        );
    }

    resetActionState({ eventOverrides: { hostCircleIds: [otherCircleId] } });
    actionState.memberships[otherCircleId] = ["moderators"];
    assert.equal(
        (await getEventOccurrenceSeriesParticipantCandidatesAction("primary", circleId, occurrenceKey)).success,
        true,
    );
    for (const status of ["paused", "suspended", "removed"] as const) {
        resetActionState({ eventOverrides: { hostCircleIds: [otherCircleId] } });
        actionState.memberships[otherCircleId] = ["moderators"];
        actionState.lifecycle[otherCircleId] = status;
        assert.deepEqual(
            await getEventOccurrenceSeriesParticipantCandidatesAction("primary", circleId, occurrenceKey),
            neutralOccurrenceResult,
        );
    }
});

test("candidate action orchestration neutrally denies anonymous, view-only, broad everyone, and host substitution", async () => {
    assert.deepEqual(await runCandidateAction({ userDid: null }), neutralResult);
    assert.deepEqual(await runCandidateAction({ memberships: {} }), neutralResult, "view-only nonmember is denied");

    for (const handle of ["review", "moderate"]) {
        assert.deepEqual(
            await runCandidateAction({
                hostCircles: {
                    [circleId]: { ...circle, accessRules: { events: { [handle]: ["everyone"] } } as any },
                },
            }),
            neutralResult,
            `nonmember events.${handle}=everyone is denied without leaking count`,
        );
    }

    assert.deepEqual(
        await runCandidateAction({ routeCircle: { ...circle, _id: otherCircleId } }),
        neutralResult,
        "an unrelated route circle cannot substitute for an event host",
    );
    assert.deepEqual(await runCandidateAction({ routeCircle: null }), neutralResult, "unknown/hidden route is neutral");
    assert.deepEqual(await runCandidateAction({ targetEvent: null }), neutralResult, "unknown event is neutral");
    assert.deepEqual(
        await runCandidateAction({
            routeCircle: { ...circle, publishStatus: "draft" },
            hostCircles: {
                [circleId]: {
                    ...circle,
                    publishStatus: "draft",
                    accessRules: { events: { review: ["everyone"] } } as any,
                },
            },
        }),
        neutralResult,
        "an unpublished host remains neutral to a nonmember with a broad rule",
    );
});

test("creator and real member review/moderate groups succeed while other member groups do not", async () => {
    assert.equal((await runCandidateAction({ userDid: "did:creator" })).circleMemberCount, 1);
    assert.equal((await runCandidateAction({ memberships: { [circleId]: ["moderators"] } })).circleMemberCount, 1);
    assert.equal((await runCandidateAction({ memberships: { [circleId]: ["admins"] } })).circleMemberCount, 1);
    assert.deepEqual(await runCandidateAction({ memberships: { [circleId]: ["members"] } }), neutralResult);

    const customCircle = {
        ...circle,
        accessRules: { events: { review: ["event-reviewers"], moderate: ["event-moderators"] } } as any,
    };
    assert.equal(
        (
            await runCandidateAction({
                hostCircles: { [circleId]: customCircle },
                memberships: { [circleId]: ["event-reviewers"] },
            })
        ).circleMemberCount,
        1,
    );
    assert.equal(
        (
            await runCandidateAction({
                hostCircles: { [circleId]: customCircle },
                memberships: { [circleId]: ["event-moderators"] },
            })
        ).circleMemberCount,
        1,
    );
});

test("all-host lifecycle and one-host legitimate member authority match multi-host management semantics", async () => {
    const multiHostEvent = { ...event, hostCircleIds: [otherCircleId] };
    const authorised = {
        targetEvent: multiHostEvent,
        memberships: { [otherCircleId]: ["moderators"] },
    };
    assert.equal((await runCandidateAction(authorised)).circleMemberCount, 1);
    for (const status of ["paused", "suspended", "removed"] as const) {
        assert.deepEqual(
            await runCandidateAction({ ...authorised, lifecycle: { [otherCircleId]: status } }),
            neutralResult,
            `any ${status} host denies the read`,
        );
    }
    assert.deepEqual(
        await runCandidateAction({
            targetEvent: multiHostEvent,
            hostCircles: {
                [otherCircleId]: {
                    ...circle,
                    _id: otherCircleId,
                    accessRules: { events: { review: ["everyone"] } } as any,
                },
            },
        }),
        neutralResult,
        "everyone on any host cannot grant multi-host roster access",
    );
});

test("occurrence preview uses the same creator/member authority boundary", async () => {
    const broadDeps: any = {
        getHostCircle: async () => ({ ...circle, accessRules: { events: { review: ["everyone"] } } }),
        getMembership: async () => null,
        isFeatureAuthorized: async () => true,
    };
    assert.equal(await hasEventInviteCandidateAuthority("did:nonmember", event, broadDeps), false);
    assert.equal(await hasEventInviteCandidateAuthority("did:creator", event, broadDeps), true);

    const memberDeps: any = {
        getHostCircle: async () => circle,
        getMembership: async () => ({ userGroups: ["moderators"] }),
        isFeatureAuthorized: async () => true,
    };
    assert.equal(await hasEventInviteCandidateAuthority("did:reviewer", event, memberDeps), true);
});

test("member and accepted-contact candidates contain exactly the invite DTO fields", async () => {
    const memberCandidates = await getEligibleCircleMemberEventInviteCandidates(circleId, "did:inviter");
    const combinedCandidates = await getEligibleEventInviteCandidates({
        circleId,
        isUserCircle: false,
        inviterDid: "did:inviter",
    });

    assert.deepEqual(memberCandidates[0], {
        did: sensitiveProfile.did,
        name: sensitiveProfile.name,
        handle: sensitiveProfile.handle,
        picture: { url: sensitiveProfile.picture.url },
        inviteSources: ["circle_member"],
        inviteSourceLabel: "Circle member",
    });
    assert.deepEqual(Object.keys(combinedCandidates[0]).sort(), [
        "did",
        "handle",
        "inviteSourceLabel",
        "inviteSources",
        "name",
        "picture",
    ]);
    assert.deepEqual(Object.keys(combinedCandidates[0].picture!).sort(), ["url"]);
    assert.deepEqual(combinedCandidates[0].inviteSources, ["circle_member", "contact"]);
    assert.equal(combinedCandidates[0].inviteSourceLabel, "Circle member + Contact");
    assert.deepEqual(profileProjection, { _id: 0, did: 1, name: 1, handle: 1, "picture.url": 1 });
    for (const secret of Object.values(sensitiveProfile).flatMap((value) =>
        typeof value === "string" && value.startsWith("PRIVATE") ? [value] : [],
    )) {
        assert.equal(JSON.stringify(combinedCandidates).includes(secret), false);
    }
});

test("actions expose one neutral denial shape and no event-less roster search remains", () => {
    const actions = readFileSync("src/app/circles/[handle]/events/actions.ts", "utf8");
    const candidateActions = actions.slice(
        actions.indexOf("export async function getEventInviteCandidatesAction"),
        actions.indexOf("export async function hideCancelledEventAction"),
    );
    assert.equal(actions.includes(["searchEligibleUsers", "Action"].join("")), false);
    assert.equal(actions.includes(["getCircleMembers", "Action"].join("")), false);
    assert.match(actions, /resolveEventInviteCandidateTarget/);
    assert.match(actions, /canManageEvent\(userDid, event\)/);
    assert.match(actions, /assertEventHostCirclesWritable\(event\)/);
    assert.match(actions, /if \(!target\) return defaultResult/);
    assert.doesNotMatch(candidateActions, /Not authorized|Circle not found|Event not found|User not authenticated/);

    const eventData = readFileSync("src/lib/data/event.ts", "utf8");
    assert.match(eventData, /event\.createdBy === userDid[\s\S]*return true/);
    assert.match(eventData, /features\.events\.review/);
    assert.match(eventData, /features\.events\.moderate/);
});

test("invite UI uses the DTO, selects by DID, renders source labels, and retains bulk invite", () => {
    const picker = readFileSync("src/components/forms/user-picker.tsx", "utf8");
    const modal = readFileSync("src/components/modules/events/invite-modal.tsx", "utf8");
    assert.match(picker, /EventInviteCandidateDto/);
    assert.match(picker, /s\.did === user\.did/);
    assert.match(picker, /user\.inviteSourceLabel/);
    assert.match(modal, /getEventCircleMemberInviteCandidatesAction/);
    assert.match(modal, /selectedByDid\.set\(member\.did, member\)/);
    assert.match(modal, /inviteUsersToEventAction/);
});
