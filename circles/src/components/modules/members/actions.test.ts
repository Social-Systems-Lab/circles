import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { beforeEach, test } from "node:test";
// @ts-expect-error Bun's runtime mock API is available when this test is run with `bun test`.
import { mock } from "bun:test";

type Lifecycle = "active" | "paused" | "suspended" | "removed";

const state = {
    callerDid: undefined as string | undefined,
    managedCircleIds: new Set<string>(),
    circles: new Map<string, any>(),
    members: new Map<string, any>(),
    memberReads: [] as Array<{ userDid: string; circleId: string }>,
    removed: [] as Array<{ userDid: string; circleId: string }>,
    updated: [] as Array<{ userDid: string; circleId: string; userGroups: string[] }>,
};

const circleA = {
    _id: "circle-a",
    handle: "circle-a",
    circleType: "circle",
    moderationStatus: "active" as Lifecycle,
    userGroups: [
        { handle: "admins", name: "Admins", accessLevel: 0 },
        { handle: "members", name: "Members", accessLevel: 10 },
    ],
};
const circleB = { ...circleA, _id: "circle-b", handle: "circle-b" };

const memberKey = (userDid: string, circleId: string) => `${circleId}:${userDid}`;

mock.module("@/lib/auth/auth", () => ({
    getAuthenticatedUserDid: async () => state.callerDid,
    getMemberAccessLevel: async () => 0,
    hasHigherAccess: async () => true,
    isAuthorized: async (_userDid: string | undefined, circleId: string) => {
        const circle = state.circles.get(circleId);
        return Boolean(
            state.callerDid && state.managedCircleIds.has(circleId) && circle?.moderationStatus === "active",
        );
    },
}));
mock.module("@/lib/data/admin-role-removal", () => ({
    approveAdminRoleRemovalRequest: async () => undefined,
    createAdminRoleRemovalRequest: async () => ({ created: false }),
    declineAdminRoleRemovalRequest: async () => undefined,
}));
mock.module("@/lib/data/circle", () => ({
    getCircleById: async (circleId: string) => state.circles.get(circleId),
    getCirclePath: async (circle: { handle: string }) => `/circles/${circle.handle}/`,
}));
mock.module("@/lib/data/constants", () => ({
    features: {
        general: {
            edit_lower_user_groups: { handle: "edit-lower" },
            edit_same_level_user_groups: { handle: "edit-same" },
            remove_lower_members: { handle: "remove-lower" },
            remove_same_level_members: { handle: "remove-same" },
        },
    },
}));
mock.module("@/lib/data/circle-detach", () => ({
    DETACH_ADMIN_CHANGE_BLOCK_MESSAGE: "blocked",
    getPendingDetachCircleRequest: async () => null,
}));
mock.module("@/lib/data/member", () => ({
    countAdmins: async () => 2,
    getMember: async (userDid: string, circleId: string) => {
        state.memberReads.push({ userDid, circleId });
        return state.members.get(memberKey(userDid, circleId)) ?? null;
    },
    removeMember: async (userDid: string, circleId: string) => {
        state.removed.push({ userDid, circleId });
        return true;
    },
    updateMemberUserGroups: async (userDid: string, circleId: string, userGroups: string[]) => {
        state.updated.push({ userDid, circleId, userGroups });
        return { userDid, circleId, userGroups };
    },
}));
mock.module("@/lib/data/notifications", () => ({ sendNotifications: async () => undefined }));
mock.module("@/lib/data/user", () => ({ getUserPrivate: async (did: string) => ({ did, name: did }) }));
mock.module("@/lib/utils", () => ({
    safeModifyMemberUserGroups: (_existing: string[], requested: string[]) => requested,
}));
mock.module("next/cache", () => ({ revalidatePath: () => undefined }));

const { removeMemberAction, updateUserGroupsAction } = await import("./actions");

beforeEach(() => {
    state.callerDid = undefined;
    state.managedCircleIds.clear();
    state.circles = new Map([
        [circleA._id, { ...circleA, moderationStatus: "active" }],
        [circleB._id, { ...circleB, moderationStatus: "active" }],
    ]);
    state.members = new Map([
        [memberKey("did:a", circleA._id), { userDid: "did:a", circleId: circleA._id, userGroups: ["members"] }],
        [memberKey("did:b", circleB._id), { userDid: "did:b", circleId: circleB._id, userGroups: ["members"] }],
    ]);
    state.memberReads = [];
    state.removed = [];
    state.updated = [];
});

test("anonymous callers cannot edit groups or remove members", async () => {
    assert.equal((await updateUserGroupsAction("did:a", circleA._id, ["members"])).success, false);
    assert.equal((await removeMemberAction("did:a", circleA._id)).success, false);
    assert.deepEqual(state.updated, []);
    assert.deepEqual(state.removed, []);
});

test("authenticated unauthorized callers cannot edit groups or remove members", async () => {
    state.callerDid = "did:viewer";
    assert.equal((await updateUserGroupsAction("did:a", circleA._id, ["members"])).success, false);
    assert.equal((await removeMemberAction("did:a", circleA._id)).success, false);
    assert.deepEqual(state.updated, []);
    assert.deepEqual(state.removed, []);
});

test("authorized managers edit and remove the authoritative target", async () => {
    state.callerDid = "did:manager";
    state.managedCircleIds.add(circleA._id);
    assert.equal((await updateUserGroupsAction("did:a", circleA._id, ["members"])).success, true);
    assert.equal((await removeMemberAction("did:a", circleA._id)).success, true);
    assert.deepEqual(state.updated, [{ userDid: "did:a", circleId: circleA._id, userGroups: ["members"] }]);
    assert.deepEqual(state.removed, [{ userDid: "did:a", circleId: circleA._id }]);
    assert.ok(state.memberReads.every((read) => read.userDid === "did:a" && read.circleId === circleA._id));
});

test("circle and target substitution are re-fetched and cannot escape authorization", async () => {
    state.callerDid = "did:manager";
    state.managedCircleIds.add(circleA._id);

    assert.equal((await updateUserGroupsAction("did:b", circleB._id, ["members"])).success, false);
    assert.equal((await removeMemberAction("did:b", circleB._id)).success, false);
    assert.equal((await updateUserGroupsAction("did:missing", circleA._id, ["members"])).success, false);
    assert.equal((await removeMemberAction("did:missing", circleA._id)).success, false);
    assert.deepEqual(state.updated, []);
    assert.deepEqual(state.removed, []);
    assert.ok(state.memberReads.some((read) => read.userDid === "did:b" && read.circleId === circleB._id));
    assert.ok(state.memberReads.some((read) => read.userDid === "did:missing" && read.circleId === circleA._id));
});

test("management actions allow active writes and deny paused, suspended, and removed lifecycles", async () => {
    state.callerDid = "did:manager";
    state.managedCircleIds.add(circleA._id);

    for (const moderationStatus of ["paused", "suspended", "removed"] as const) {
        state.circles.set(circleA._id, { ...circleA, moderationStatus });
        assert.equal((await updateUserGroupsAction("did:a", circleA._id, ["members"])).success, false);
        assert.equal((await removeMemberAction("did:a", circleA._id)).success, false);
    }
    assert.deepEqual(state.updated, []);
    assert.deepEqual(state.removed, []);

    state.circles.set(circleA._id, { ...circleA, moderationStatus: "active" });
    assert.equal((await updateUserGroupsAction("did:a", circleA._id, ["members"])).success, true);
    assert.equal((await removeMemberAction("did:a", circleA._id)).success, true);
});

test("browser mutation calls use scalar identifiers instead of raw member or circle records", () => {
    const tableSource = readFileSync("src/components/modules/members/members-table.tsx", "utf8");
    assert.match(tableSource, /removeMemberAction\(selectedMember\.userDid, circle\.id\)/);
    assert.match(tableSource, /updateUserGroupsAction\(selectedMember\.userDid, circle\.id, userGroups \?\? \[\]\)/);
    assert.doesNotMatch(tableSource, /removeMemberAction\(selectedMember,|updateUserGroupsAction\(selectedMember,/);
});
