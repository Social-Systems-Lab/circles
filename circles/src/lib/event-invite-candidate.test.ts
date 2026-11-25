import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
// @ts-expect-error Bun's runtime mock API is available when this test is run with `bun test`.
import { mock } from "bun:test";
import { ObjectId } from "mongodb";
import { formatEventOccurrenceId } from "@/lib/event-occurrence";
import type { EventInvitation, EventOccurrenceRsvpStatus, EventRsvp } from "@/models/models";

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
let roster: {
    people: { did: string; name: string; picture: { url: string; originalName: string }; email: string }[];
    invitations: Pick<EventInvitation, "userDid" | "status">[];
    rsvps: Pick<EventRsvp, "userDid" | "status">[];
} | undefined;

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
    getPostViewFeature: () => ({ handle: "view", module: "feed", defaultUserGroups: ["everyone"] }),
    features: {
        events: {
            view: {
                handle: "view",
                module: "events",
                defaultUserGroups: ["admins", "moderators", "members", "everyone"],
            },
            review: { handle: "review", module: "events", defaultUserGroups: ["admins", "moderators"] },
            moderate: { handle: "moderate", module: "events", defaultUserGroups: ["admins"] },
            rsvp: { handle: "rsvp", module: "events", defaultUserGroups: ["everyone"] },
        },
    },
}));
mock.module("@/lib/data/db", () => ({
    getDb: async () => ({
        collection: (name: string) => {
            assert.equal(name, "eventGuestInvitations");
            return {
                createIndexes: async () => [],
                find: () => cursor([{ email: "guest@example.test", status: "going", sentAt: new Date() }]),
            };
        },
    }),
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
    EventOccurrenceRsvps: {
        find: () => cursor(actionState.occurrenceRsvps),
        findOne: async ({ userDid }: { userDid: string }) =>
            actionState.occurrenceRsvps.find((rsvp) => rsvp.userDid === userDid) ?? null,
    },
    EventRsvps: { find: () => cursor(roster?.rsvps ?? []) },
    EventOccurrenceInvitations: {
        find: ({ userDid }: { userDid?: string }) =>
            cursor(
                userDid === actionState.userDid &&
                actionState.event?.isRecurringInstance &&
                actionState.event?.userInvitationStatus
                    ? [{ circleId, seriesId: actionState.event.seriesId, occurrenceKey: actionState.event.occurrenceKey }]
                    : [],
            ),
    },
    EventInvitations: {
        find: ({ userDid }: { userDid?: string }) => {
            if (roster) return cursor(roster.invitations);
            return cursor(
                userDid === actionState.userDid &&
                !actionState.event?.isRecurringInstance &&
                actionState.event?.userInvitationStatus
                    ? [{ circleId, eventId: String(actionState.event._id), status: actionState.event.userInvitationStatus }]
                    : [],
            );
        },
    },
    Feeds: {},
    Posts: {},
    Comments: {},
    PrivateMediaCollection: {},
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
    getCircleById: async (id: string) => actionState.circles[id] ?? null,
    isCirclePublished: () => true,
    getCircleByHandle: async () => actionState.routeCircle,
    ensureModuleIsEnabledOnCircle: async () => undefined,
    getCirclesBySearchQuery: async () => [],
    getDiscoverableCirclesBySearchQuery: async () => [],
    getCirclesByDids: async (dids: string[]) => roster?.people.filter((person) => dids.includes(person.did)) ?? [],
    getCirclesByIds: async (ids: string[]) =>
        ids.flatMap((id) => (actionState.circles[id] ? [actionState.circles[id]] : [])),
}));
mock.module("@/lib/data/user", () => ({
    getUserByDid: async () => null,
    getUserPrivate: async (did: string) => ({ did }),
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
    upsertRsvp: async (_eventId: string, _circleId: string, _did: string, status: EventRsvp["status"]) => {
        actionState.event.userRsvpStatus = status;
        return true;
    },
    cancelRsvp: async () => {
        actionState.event.userRsvpStatus = "none";
        return true;
    },
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
mock.module("@/lib/data/eventOccurrenceRsvp", () => ({
    upsertEventOccurrenceRsvp: async (_seriesId: string, _key: number, userDid: string, status: EventOccurrenceRsvpStatus) => {
        actionState.occurrenceRsvps = [
            ...actionState.occurrenceRsvps.filter((rsvp) => rsvp.userDid !== userDid),
            { userDid, status },
        ];
        actionState.event.userRsvpStatus = status;
        return true;
    },
}));
mock.module("@/lib/data/eventOccurrenceInvitation", () => ({ upsertEventOccurrenceInvitation: async () => undefined }));
mock.module("@/lib/data/circle-lifecycle-policy", () => ({
    getCircleModerationStatus: (candidateCircle?: any) => candidateCircle?.moderationStatus ?? "active",
    getDiscoverableLifecycleQuery: () => ({}),
    getReadableLifecycleQuery: () => ({}),
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
    getPendingEventInvitationsAction,
    getInvitedUsersAction,
    rsvpEventAction,
    rsvpEventWithOptionsAction,
    cancelRsvpAction,
    rsvpEventOccurrenceAction,
    cancelEventOccurrenceRsvpAction,
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

test("a one-off invitation leaves Awaiting response after a decline and supports later RSVP changes", async () => {
    resetActionState({
        eventOverrides: {
            userInvitationStatus: "pending",
            userRsvpStatus: "none",
            endAt: new Date(Date.now() + 86_400_000),
        },
    });
    actionState.routeCircle.enabledModules = ["events"];
    const eventId = String(actionState.event._id);
    assert.deepEqual((await getPendingEventInvitationsAction()).map(({ id }) => id), [eventId]);

    assert.deepEqual(await cancelRsvpAction("primary", eventId), { success: true, message: "Invitation declined" });
    assert.equal(actionState.event.userRsvpStatus, "cancelled");
    assert.deepEqual(await getPendingEventInvitationsAction(), []);

    assert.equal((await rsvpEventAction("primary", eventId, "interested")).success, true);
    assert.equal(actionState.event.userRsvpStatus, "interested");
    assert.equal((await rsvpEventWithOptionsAction("primary", eventId, "going", { isPublic: false })).success, true);
    assert.equal(actionState.event.userRsvpStatus, "going");
    assert.deepEqual(await getPendingEventInvitationsAction(), []);

    delete actionState.event.userInvitationStatus;
    assert.deepEqual(await cancelRsvpAction("primary", eventId), { success: true, message: "RSVP cancelled" });
    assert.equal(actionState.event.userRsvpStatus, "none", "ordinary cancellation still removes the response");
});

test("a recurring meeting invitation uses its occurrence response and is changeable after a decline", async () => {
    resetActionState({
        eventOverrides: {
            seriesId: circleId,
            occurrenceKey,
            isRecurringInstance: true,
            userInvitationStatus: "pending",
            userRsvpStatus: "none",
            endAt: new Date(Date.now() + 86_400_000),
        },
    });
    actionState.routeCircle.enabledModules = ["events"];
    const id = formatEventOccurrenceId(circleId, new Date(occurrenceKey));
    assert.deepEqual((await getPendingEventInvitationsAction()).map(({ id }) => id), [id]);

    assert.equal((await cancelEventOccurrenceRsvpAction("primary", circleId, occurrenceKey)).success, true);
    assert.ok(actionState.occurrenceRsvps.some((rsvp) => rsvp.userDid === actionState.userDid && rsvp.status === "none"));
    assert.deepEqual(await getPendingEventInvitationsAction(), []);

    for (const status of ["interested", "going"] as const) {
        assert.equal((await rsvpEventOccurrenceAction("primary", circleId, occurrenceKey, status)).success, true);
        assert.equal(actionState.event.userRsvpStatus, status);
        assert.deepEqual(await getPendingEventInvitationsAction(), []);
    }
});

test("invitee responses come from existing RSVPs and are visible only to event managers", async () => {
    resetActionState({ userDid: "did:creator" });
    const statuses = ["pending", "going", "interested", "cancelled", "declined", "waitlist"] as const;
    const people = statuses.map((status) => ({
        did: `did:example:${status}`,
        name: `Member ${status}`,
        picture: { url: `https://example.test/${status}.png`, originalName: "private-file-name" },
        email: "private@example.test",
    }));
    roster = {
        people,
        invitations: statuses.map((status, index) => ({
            userDid: people[index].did,
            status: status === "declined" ? "declined" : status === "interested" ? "accepted" : "pending",
        })),
        rsvps: [
            { userDid: people[1].did, status: "going" },
            { userDid: people[2].did, status: "interested" },
            { userDid: people[3].did, status: "cancelled" },
            { userDid: people[5].did, status: "waitlist" },
        ],
    };
    try {
        const id = String(actionState.event._id);
        const manager = await getInvitedUsersAction("primary", id, true);
        assert.equal(manager.success, true);
        assert.deepEqual(manager.users.map((user) => user.response), [
            "pending", "going", "interested", "cancelled", "cancelled", "interested",
        ]);
        assert.deepEqual(manager.users[0].picture, { url: people[0].picture.url });
        assert.equal("email" in manager.users[0], false);
        assert.deepEqual(manager.guests, [{ email: "guest@example.test", status: "going", deliveryConfirmed: true }]);

        actionState.userDid = "did:visitor";
        const visitor = await getInvitedUsersAction("primary", id, true);
        assert.equal(visitor.users.length, people.length);
        assert.ok(visitor.users.every((user) => !("response" in user)));
        assert.deepEqual(visitor.guests, []);

        actionState.routeCircle = actionState.circles[otherCircleId];
        assert.deepEqual(await getInvitedUsersAction("secondary", id, true), { success: false, users: [], guests: [] });

        actionState.routeCircle = actionState.circles[circleId];
        actionState.event.isRecurringInstance = true;
        assert.deepEqual(
            await getInvitedUsersAction("primary", id, true),
            { success: false, users: [], guests: [] },
            "an occurrence read must not expose the series invitees",
        );
    } finally {
        roster = undefined;
    }
});
