import assert from "node:assert/strict";
// @ts-expect-error Bun provides its test and mock APIs at runtime.
import { beforeEach, mock, test } from "bun:test";

const state = {
    circle: undefined as any,
    added: [] as string[],
    requested: [] as string[],
    lifecycleChecks: [] as string[],
    membershipRequests: new Map<string, any>(),
    updatedRequests: [] as Array<{ requestId: string; status: "approved" | "rejected" }>,
    operations: [] as string[],
};

mock.module("@/lib/auth/jwt", () => ({ verifyUserToken: async () => ({ userDid: "did:viewer" }) }));
mock.module("@/lib/auth/cookie", () => ({ readAuthToken: () => "token" }));
mock.module("next/headers", () => ({ cookies: async () => ({}) }));
mock.module("@/lib/data/member", () => ({
    addMember: async (_did: string, circleId: string) => {
        state.added.push(circleId);
        state.operations.push("add-member");
    },
    countAdmins: async () => 1,
    getMember: async () => null,
    removeMember: async () => true,
}));
mock.module("@/lib/data/membership-requests", () => ({
    createPendingMembershipRequest: async (_did: string, circleId: string) => void state.requested.push(circleId),
    deletePendingMembershipRequest: async () => true,
    getAllMembershipRequests: async () => ({ pendingRequests: [], rejectedRequests: [] }),
    getMembershipRequest: async (requestId: string) => state.membershipRequests.get(requestId),
    updatePendingMembershipRequestStatus: async (requestId: string, status: "approved" | "rejected") => {
        state.updatedRequests.push({ requestId, status });
        state.operations.push(`mark-${status}`);
        return state.membershipRequests.get(requestId);
    },
}));
mock.module("@/lib/data/circle", () => ({
    getCircleById: async () => state.circle,
    getCirclePath: async () => "/circles/test/",
    updateCircle: async () => undefined,
    getCircleByDid: async () => undefined,
    getDiscoverableCirclesByIds: async () => [],
}));
mock.module("@/lib/data/circle-detach", () => ({
    DETACH_ADMIN_CHANGE_BLOCK_MESSAGE: "blocked",
    getPendingDetachCircleRequest: async () => null,
}));
mock.module("@/lib/auth/auth", () => ({
    getAuthenticatedUserDid: async () => "did:viewer",
    getAuthorizedMembers: async () => [],
    isAuthorized: async () => true,
}));
mock.module("@/lib/data/constants", () => ({ features: { general: { manage_membership_requests: {} } } }));
mock.module("@/lib/data/storage", () => ({ saveFile: async () => undefined }));
mock.module("@/lib/data/circle-media-storage", () => ({
    collectReplacedCircleMedia: () => [],
    persistCircleThenCleanupMedia: async () => undefined,
    saveCircleOwnedFile: async () => undefined,
}));
mock.module("next/cache", () => ({ revalidatePath: () => undefined }));
mock.module("@/lib/data/user", () => ({
    getUser: async (did: string) => ({ did }),
    getUserById: async () => undefined,
    getUserPrivate: async (did: string) => ({ did }),
    addBookmark: async () => undefined,
    removeBookmark: async () => undefined,
    pinCircle: async () => undefined,
    unpinCircle: async () => undefined,
}));
mock.module("@/lib/data/notifications", () => ({
    notifyNewMember: async () => undefined,
    sendNotifications: async () => undefined,
}));
mock.module("@/lib/data/chat", () => ({ findOrCreateDMRoom: async () => undefined }));
mock.module("@/lib/data/relationships", () => ({
    getDmEligibility: async () => undefined,
    getProfileRelationshipState: async () => undefined,
    listToolboxConnectionsForUserDid: async () => [],
}));
mock.module("@/lib/data/db", () => ({ UserRelationships: {} }));
mock.module("@/lib/profile-completion", () => ({
    canParticipate: () => true,
    getParticipationRequiredMessage: () => "",
}));
mock.module("@/lib/data/circle-lifecycle-policy", () => ({
    assertCircleWritesAllowed: async (circleId: string) => void state.lifecycleChecks.push(circleId),
}));
mock.module("@/lib/data/client-user-dto", () => ({
    toAuthenticatedClientUser: (value: unknown) => value,
    toBookmarkStateDto: (value: unknown) => value,
    toPinStateDto: (value: unknown) => value,
}));
mock.module("@/lib/data/client-user-boundary", () => ({
    executeAuthenticatedUserMutation: async () => undefined,
    getAuthenticatedClientUserBoundary: async () => undefined,
    getOwnedUserUpdateBoundary: async () => undefined,
}));

const { followCircle } = await import("./actions");
const { approveMembershipRequestAction, rejectMembershipRequestAction } = await import(
    "../membership-requests/actions"
);

const circleA = { _id: "circle-a", handle: "circle-a", circleType: "circle" } as any;
const circleB = { _id: "circle-b", handle: "circle-b", circleType: "circle" } as any;

const membershipRequest = (id: string, circleId: string, status: "pending" | "approved" | "rejected" = "pending") => ({
    _id: id,
    userDid: `did:${id}`,
    circleId,
    status,
    requestedAt: new Date(),
});

beforeEach(() => {
    state.circle = undefined;
    state.added = [];
    state.requested = [];
    state.lifecycleChecks = [];
    state.membershipRequests.clear();
    state.updatedRequests = [];
    state.operations = [];
});

test("Secret Circles reject the ordinary follow flow without creating a request", async () => {
    state.circle = { _id: "secret-circle", circleType: "circle", visibility: "secret", isPublic: false };

    const result = await followCircle({ _id: "secret-circle", circleType: "circle" } as any);

    assert.deepEqual(result, { success: false, message: "Circle not found" });
    assert.deepEqual(state.requested, []);
    assert.deepEqual(state.added, []);
    assert.deepEqual(state.lifecycleChecks, []);
});

test("public Circles retain direct membership behavior", async () => {
    state.circle = { _id: "public-circle", circleType: "circle", visibility: "public", isPublic: true };

    const result = await followCircle({ _id: "public-circle", circleType: "circle" } as any);

    assert.equal(result.success, true);
    assert.equal(result.pending, false);
    assert.deepEqual(state.added, ["public-circle"]);
    assert.deepEqual(state.requested, []);
    assert.deepEqual(state.lifecycleChecks, ["public-circle"]);
});

test("ordinary approval-based Circles retain pending-request behavior", async () => {
    state.circle = { _id: "private-circle", circleType: "circle", visibility: "public", isPublic: false };

    const result = await followCircle({ _id: "private-circle", circleType: "circle" } as any);

    assert.equal(result.success, true);
    assert.equal(result.pending, true);
    assert.deepEqual(state.requested, ["private-circle"]);
    assert.deepEqual(state.added, []);
    assert.deepEqual(state.lifecycleChecks, ["private-circle"]);
});

test("a request for Circle A cannot be approved through Circle B", async () => {
    state.membershipRequests.set("request-a", membershipRequest("request-a", "circle-a"));

    assert.equal((await approveMembershipRequestAction("request-a", circleB)).success, false);
    assert.deepEqual(state.added, []);
    assert.deepEqual(state.updatedRequests, []);
});

test("a non-pending request cannot create membership", async () => {
    state.membershipRequests.set("request-a", membershipRequest("request-a", "circle-a", "approved"));

    assert.equal((await approveMembershipRequestAction("request-a", circleA)).success, false);
    assert.deepEqual(state.added, []);
    assert.deepEqual(state.updatedRequests, []);
});

test("a valid pending request is added before it is marked approved", async () => {
    state.membershipRequests.set("request-a", membershipRequest("request-a", "circle-a"));

    assert.equal((await approveMembershipRequestAction("request-a", circleA)).success, true);
    assert.deepEqual(state.added, ["circle-a"]);
    assert.deepEqual(state.updatedRequests, [{ requestId: "request-a", status: "approved" }]);
    assert.deepEqual(state.operations, ["add-member", "mark-approved"]);
});

test("rejection cannot operate on a request from another Circle", async () => {
    state.membershipRequests.set("request-a", membershipRequest("request-a", "circle-a"));

    assert.equal((await rejectMembershipRequestAction("request-a", circleB)).success, false);
    assert.deepEqual(state.updatedRequests, []);
});

test("repeated rejection of a stale request is safe", async () => {
    state.membershipRequests.set("request-a", membershipRequest("request-a", "circle-a", "rejected"));

    assert.equal((await rejectMembershipRequestAction("request-a", circleA)).success, false);
    assert.deepEqual(state.updatedRequests, []);
});

test("a valid pending request can still be rejected", async () => {
    state.membershipRequests.set("request-a", membershipRequest("request-a", "circle-a"));

    assert.equal((await rejectMembershipRequestAction("request-a", circleA)).success, true);
    assert.deepEqual(state.updatedRequests, [{ requestId: "request-a", status: "rejected" }]);
    assert.deepEqual(state.added, []);
});
