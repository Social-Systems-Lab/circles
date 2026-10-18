import assert from "node:assert/strict";
// @ts-expect-error Bun's runtime test module is available even though this repository does not install its types.
import { beforeEach, mock, test } from "bun:test";
import { ObjectId } from "mongodb";

type Doc = Record<string, any>;
const state = {
    viewer: "did:recipient",
    invites: [] as Doc[],
    members: [] as Doc[],
    indexes: true,
    notifyFails: false,
    notifications: [] as Doc[],
    reconcileCalls: 0,
    invitationMutations: 0,
    authorized: true,
    circleExists: true,
    circleType: "circle",
    circleVisibility: "secret",
    circleLifecycle: "active",
    reconcile: async (_u: string, _c: string) => {},
};
const matches = (doc: Doc, filter: Doc) =>
    Object.entries(filter).every(([key, expected]: [string, any]) => {
        const actual = doc[key];
        if (expected && typeof expected === "object" && "$exists" in expected)
            return (actual !== undefined) === expected.$exists;
        return actual?.toString?.() === expected?.toString?.();
    });
const collection = {
    find: (filter: Doc) => ({
        toArray: async () => state.invites.filter((doc) => matches(doc, filter)),
    }),
    findOne: async (filter: Doc) => state.invites.find((doc) => matches(doc, filter)) ?? null,
    insertOne: async (doc: Doc) => {
        state.invitationMutations++;
        if (
            state.invites.some(
                (item) =>
                    item.status === "pending" &&
                    item.circleId === doc.circleId &&
                    item.recipientDid === doc.recipientDid,
            )
        )
            throw Object.assign(new Error("duplicate"), { code: 11000 });
        const insertedId = new ObjectId();
        state.invites.push({ ...doc, _id: insertedId });
        return { insertedId };
    },
    findOneAndUpdate: async (filter: Doc, update: Doc) => {
        state.invitationMutations++;
        const doc = state.invites.find((item) => matches(item, filter));
        if (!doc) return null;
        Object.assign(doc, update.$set);
        return doc;
    },
    updateOne: async (filter: Doc, update: Doc) => {
        state.invitationMutations++;
        const doc = state.invites.find((item) => matches(item, filter));
        if (!doc) return { matchedCount: 0 };
        Object.assign(doc, update.$set);
        for (const key of Object.keys(update.$unset ?? {})) delete doc[key];
        return { matchedCount: 1 };
    },
    deleteOne: async (filter: Doc) => {
        state.invitationMutations++;
        const index = state.invites.findIndex((doc) => matches(doc, filter));
        if (index < 0) return { deletedCount: 0 };
        state.invites.splice(index, 1);
        return { deletedCount: 1 };
    },
};
const circle = {
    _id: new ObjectId("64b000000000000000000001"),
    did: "did:circle",
    handle: "hidden",
    name: "Hidden",
    circleType: "circle",
    visibility: "secret",
};
const recipient = {
    _id: new ObjectId(),
    did: "did:recipient",
    handle: "recipient",
    name: "Recipient Person",
    picture: { url: "https://example.test/recipient.jpg" },
    circleType: "user",
    accountStatus: "active",
};

mock.module("@/lib/auth/auth", () => ({
    getAuthenticatedUserDid: async () => state.viewer,
    isAuthorized: async () => state.authorized,
}));
mock.module("./db", () => ({
    SecretCircleInvitations: collection,
    ensureSecretCircleInvitationIndexes: async () => {
        if (!state.indexes) throw new Error("indexes unavailable");
    },
    Circles: {
        findOne: async (filter: Doc) =>
            filter.did === recipient.did || filter.handle === recipient.handle
                ? recipient
                : filter.did === "did:inviter"
                  ? { did: "did:inviter", circleType: "user", handle: "inviter" }
                  : state.circleExists && filter._id?.toString() === circle._id.toString()
                    ? {
                          ...circle,
                          circleType: state.circleType,
                          visibility: state.circleVisibility,
                          moderationStatus: state.circleLifecycle,
                      }
                    : null,
    },
    Members: { findOne: async (filter: Doc) => state.members.find((doc) => matches(doc, filter)) ?? null },
}));
mock.module("./secret-invitation-membership", () => ({
    reconcileSecretInvitationMembership: async (userDid: string, circleId: string) => {
        state.reconcileCalls++;
        return state.reconcile(userDid, circleId);
    },
}));
mock.module("./notifications", () => ({
    sendNotifications: async (type: string, recipients: Doc[], content: Doc, options: Doc) => {
        if (state.notifyFails) throw new Error("notification failed");
        state.notifications.push({ type, recipients, content, options });
    },
}));
mock.module("./circle-lifecycle-policy", () => ({
    canWriteCircleByLifecycle: (value: Doc) => value.moderationStatus === "active",
    canReadCircleByLifecycle: (value: Doc) => ["active", "paused"].includes(value.moderationStatus),
    canDiscoverCircleByLifecycle: (value: Doc) => ["active", "paused"].includes(value.moderationStatus),
    getDiscoverableLifecycleQuery: () => ({}),
}));
const subject = await import("./secret-circle-invitations");
const INVITATION_ID = "64b000000000000000000002";
const pending = (): Doc => ({
    _id: new ObjectId(INVITATION_ID),
    circleId: circle._id.toString(),
    recipientDid: recipient.did,
    invitedByDid: "did:inviter",
    status: "pending",
    createdAt: new Date(),
    updatedAt: new Date(),
});

beforeEach(() => {
    state.viewer = recipient.did;
    state.invites = [];
    state.members = [{ _id: new ObjectId(), userDid: "did:inviter", circleId: circle._id.toString() }];
    state.indexes = true;
    state.notifyFails = false;
    state.notifications = [];
    state.reconcileCalls = 0;
    state.invitationMutations = 0;
    state.authorized = true;
    state.circleExists = true;
    state.circleType = "circle";
    state.circleVisibility = "secret";
    state.circleLifecycle = "active";
    state.reconcile = async (userDid, circleId) => {
        if (!state.members.some((member) => member.userDid === userDid && member.circleId === circleId))
            state.members.push({ _id: new ObjectId(), userDid, circleId });
    };
});

test("accepted inspection returns only the handle for a readable canonical member without mutating", async () => {
    state.invites.push({ ...pending(), status: "accepted" });
    state.members.push({ _id: new ObjectId(), userDid: recipient.did, circleId: circle._id.toString() });
    assert.deepEqual(await subject.inspectSecretCircleInvitation(INVITATION_ID), {
        status: "accepted",
        circle: { handle: "hidden" },
    });
    assert.equal(state.reconcileCalls, 0);
    assert.equal(state.invitationMutations, 0);
});

test("accepted inspection is unavailable after canonical membership is removed", async () => {
    state.invites.push({ ...pending(), status: "accepted" });
    assert.equal(await subject.inspectSecretCircleInvitation(INVITATION_ID), null);
});

test("accepted inspection is unavailable when the Circle is missing or no longer secret", async () => {
    state.invites.push({ ...pending(), status: "accepted" });
    state.members.push({ _id: new ObjectId(), userDid: recipient.did, circleId: circle._id.toString() });
    state.circleExists = false;
    assert.equal(await subject.inspectSecretCircleInvitation(INVITATION_ID), null);
    state.circleExists = true;
    state.circleVisibility = "public";
    assert.equal(await subject.inspectSecretCircleInvitation(INVITATION_ID), null);
});

test("accepted inspection is unavailable when the central lifecycle read policy denies access", async () => {
    state.invites.push({ ...pending(), status: "accepted" });
    state.members.push({ _id: new ObjectId(), userDid: recipient.did, circleId: circle._id.toString() });
    for (const moderationStatus of ["suspended", "removed"]) {
        state.circleLifecycle = moderationStatus;
        assert.equal(await subject.inspectSecretCircleInvitation(INVITATION_ID), null);
    }
});

test("accepted inspection ignores former inviter membership and permission", async () => {
    state.invites.push({ ...pending(), status: "accepted" });
    state.members = [{ _id: new ObjectId(), userDid: recipient.did, circleId: circle._id.toString() }];
    state.authorized = false;
    assert.equal((await subject.inspectSecretCircleInvitation(INVITATION_ID))?.circle.handle, "hidden");
});

test("inspection stays neutral for the wrong recipient and logged-out viewer", async () => {
    state.invites.push({ ...pending(), status: "accepted" });
    state.members.push({ _id: new ObjectId(), userDid: recipient.did, circleId: circle._id.toString() });
    state.viewer = "did:wrong";
    assert.equal(await subject.inspectSecretCircleInvitation(INVITATION_ID), null);
    state.viewer = "";
    assert.equal(await subject.inspectSecretCircleInvitation(INVITATION_ID), null);
});

test("invalid and guessed invitation IDs stay neutral", async () => {
    assert.equal(await subject.inspectSecretCircleInvitation("not-an-object-id"), null);
    assert.equal(await subject.acceptSecretCircleInvitation("not-an-object-id").then((result) => result.ok), false);
    assert.equal(await subject.inspectSecretCircleInvitation("64b000000000000000000099"), null);
    state.viewer = "did:wrong";
    assert.equal(await subject.inspectSecretCircleInvitation("64b000000000000000000099"), null);
});

test("pending inspection reveals details only to the intended recipient", async () => {
    const invite = { ...pending(), _id: new ObjectId("64b000000000000000000003") };
    state.invites.push(invite);
    state.viewer = "did:wrong";
    assert.equal(await subject.inspectSecretCircleInvitation(invite._id.toString()), null);
    state.viewer = recipient.did;
    assert.deepEqual(await subject.inspectSecretCircleInvitation(invite._id.toString()), {
        status: "pending",
        circle: { name: "Hidden", handle: "hidden", picture: undefined },
        inviter: { name: undefined, handle: "inviter", picture: undefined },
    });
});

test("pending inspection still requires current inviter membership and permission", async () => {
    state.invites.push(pending());
    state.members = [];
    assert.equal(await subject.inspectSecretCircleInvitation(INVITATION_ID), null);
    state.members.push({ _id: new ObjectId(), userDid: "did:inviter", circleId: circle._id.toString() });
    state.authorized = false;
    assert.equal(await subject.inspectSecretCircleInvitation(INVITATION_ID), null);
});

test("processing invitation cannot be revoked or claimed twice", async () => {
    const invite: Doc = { ...pending(), processingBy: "first", processingAt: new Date() };
    state.invites.push(invite);
    state.viewer = "did:inviter";
    assert.deepEqual(await subject.revokeSecretCircleInvitation(invite._id.toString()), { ok: false });
    state.viewer = recipient.did;
    assert.deepEqual(await subject.acceptSecretCircleInvitation(INVITATION_ID), { ok: false });
    assert.equal(state.reconcileCalls, 0);
});
test("accept finalization losing ownership does not return false success", async () => {
    const invite = pending();
    state.invites.push(invite);
    state.reconcile = async (userDid, circleId) => {
        state.members.push({ _id: new ObjectId(), userDid, circleId });
        invite.status = "revoked";
        delete invite.processingBy;
    };
    assert.deepEqual(await subject.acceptSecretCircleInvitation(INVITATION_ID), { ok: false });
});
test("accepted invitation with canonical membership is idempotent", async () => {
    state.invites.push({ ...pending(), status: "accepted" });
    state.members.push({ _id: new ObjectId(), userDid: recipient.did, circleId: circle._id.toString() });
    assert.deepEqual(await subject.acceptSecretCircleInvitation(INVITATION_ID), { ok: true, circleHandle: "hidden" });
    assert.equal(state.reconcileCalls, 0);
});
test("failure before insert releases owned claim and remains retryable", async () => {
    const invite = pending();
    state.invites.push(invite);
    state.reconcile = async () => {
        throw new Error("insert failed");
    };
    await assert.rejects(subject.acceptSecretCircleInvitation(INVITATION_ID), /insert failed/);
    assert.equal(invite.status, "pending");
    assert.equal(invite.processingBy, undefined);
});
test("partial membership failure remains pending; retry reconciles without duplicate canonical membership", async () => {
    const invite = pending();
    state.invites.push(invite);
    state.reconcile = async (userDid, circleId) => {
        state.members.push({ _id: new ObjectId(), userDid, circleId });
        throw new Error("chat failed");
    };
    await assert.rejects(subject.acceptSecretCircleInvitation(INVITATION_ID), /chat failed/);
    assert.equal(invite.status, "pending");
    state.reconcile = async () => {};
    assert.equal((await subject.acceptSecretCircleInvitation(INVITATION_ID)).ok, true);
    assert.equal(state.members.filter((member) => member.userDid === recipient.did).length, 1);
});
test("notification failure deletes only the new pending invitation and retry succeeds", async () => {
    state.viewer = "did:inviter";
    state.notifyFails = true;
    await assert.rejects(subject.createSecretCircleInvitation(circle._id.toString(), "recipient"));
    assert.equal(state.invites.length, 0);
    state.notifyFails = false;
    assert.equal((await subject.createSecretCircleInvitation(circle._id.toString(), "recipient")).ok, true);
});
test("notification persists only a generic body and invitation ObjectId locator", async () => {
    state.viewer = "did:inviter";
    assert.equal((await subject.createSecretCircleInvitation(circle._id.toString(), "recipient")).ok, true);
    const invitation = state.invites[0];
    assert.deepEqual(state.notifications, [
        {
            type: "secret_circle_invitation",
            recipients: [{ did: recipient.did }],
            content: {
                body: "You have received a private Circle invitation.",
                url: `/secret-invitations/${invitation._id.toString()}`,
                invitationId: invitation._id.toString(),
            },
            options: { idempotencyKey: invitation._id.toString() },
        },
    ]);
    const persisted = JSON.stringify({ invitation, notification: state.notifications[0].content });
    assert.doesNotMatch(persisted, /tokenHash|rawToken|secretToken/);
    assert.equal(state.notifications[0].content.url.split("/").at(-1), invitation._id.toString());
});
test("existing duplicate invitation is never deleted by another failed request", async () => {
    state.viewer = "did:inviter";
    const existing = pending();
    state.invites.push(existing);
    state.notifyFails = true;
    assert.deepEqual(await subject.createSecretCircleInvitation(circle._id.toString(), "recipient"), {
        ok: true,
        alreadyInvited: true,
    });
    assert.equal(state.invites[0], existing);
});
test("index readiness failure prevents mutation", async () => {
    state.indexes = false;
    state.viewer = "did:inviter";
    await assert.rejects(subject.createSecretCircleInvitation(circle._id.toString(), "recipient"), /indexes/);
    assert.equal(state.invites.length, 0);
});
test("accepted cannot be revoked and repeated revoke is idempotent", async () => {
    state.viewer = "did:inviter";
    const accepted: Doc = { ...pending(), status: "accepted" };
    state.invites.push(accepted);
    assert.deepEqual(await subject.revokeSecretCircleInvitation(accepted._id.toString()), { ok: false });
    const invite = { ...pending(), _id: new ObjectId("64b000000000000000000004") };
    state.invites.push(invite);
    assert.deepEqual(await subject.revokeSecretCircleInvitation(invite._id.toString()), {
        ok: true,
        status: "revoked",
    });
    assert.deepEqual(await subject.revokeSecretCircleInvitation(invite._id.toString()), {
        ok: true,
        status: "revoked",
    });
});
test("authorized inviter lists only pending invitations as recipient-safe DTOs", async () => {
    state.viewer = "did:inviter";
    const invitation = pending();
    state.invites.push(
        invitation,
        { ...pending(), _id: new ObjectId(), status: "accepted" },
        { ...pending(), _id: new ObjectId(), status: "revoked" },
    );
    const result = await subject.listPendingSecretCircleInvitations(circle._id.toString());
    assert.deepEqual(result, {
        ok: true,
        invitations: [
            {
                invitationId: invitation._id.toString(),
                recipientName: "Recipient Person",
                recipientHandle: "recipient",
                recipientAvatarUrl: "https://example.test/recipient.jpg",
                invitedAt: invitation.createdAt.toISOString(),
            },
        ],
    });
    const serialized = JSON.stringify(result);
    assert.doesNotMatch(
        serialized,
        /tokenHash|rawToken|raw token|recipientDid|invitedByDid|did:|\/secret-invitations\//i,
    );
});
test("pending invitation for an existing canonical member is excluded without mutation", async () => {
    state.viewer = "did:inviter";
    state.invites.push(pending());
    state.members.push({ _id: new ObjectId(), userDid: recipient.did, circleId: circle._id.toString() });
    assert.deepEqual(await subject.listPendingSecretCircleInvitations(circle._id.toString()), {
        ok: true,
        invitations: [],
    });
    assert.equal(state.invitationMutations, 0);
});
test("pending list fails closed for logged-out, former, and unauthorized members", async () => {
    state.invites.push(pending());
    state.viewer = "";
    assert.deepEqual(await subject.listPendingSecretCircleInvitations(circle._id.toString()), { ok: false });
    state.viewer = "did:inviter";
    state.members = [];
    assert.deepEqual(await subject.listPendingSecretCircleInvitations(circle._id.toString()), { ok: false });
    state.members.push({ _id: new ObjectId(), userDid: "did:inviter", circleId: circle._id.toString() });
    state.authorized = false;
    assert.deepEqual(await subject.listPendingSecretCircleInvitations(circle._id.toString()), { ok: false });
});
test("pending list fails closed for non-secret and non-writable Circles", async () => {
    state.viewer = "did:inviter";
    state.circleType = "user";
    assert.deepEqual(await subject.listPendingSecretCircleInvitations(circle._id.toString()), { ok: false });
    state.circleType = "circle";
    state.circleVisibility = "public";
    assert.deepEqual(await subject.listPendingSecretCircleInvitations(circle._id.toString()), { ok: false });
    state.circleVisibility = "secret";
    for (const lifecycle of ["paused", "suspended", "removed"]) {
        state.circleLifecycle = lifecycle;
        assert.deepEqual(await subject.listPendingSecretCircleInvitations(circle._id.toString()), { ok: false });
    }
});
test("revoke requires current inviter authorization", async () => {
    state.viewer = "did:ordinary-member";
    state.members.push({ _id: new ObjectId(), userDid: state.viewer, circleId: circle._id.toString() });
    state.authorized = false;
    const invitation = pending();
    state.invites.push(invitation);
    assert.deepEqual(await subject.revokeSecretCircleInvitation(invitation._id.toString()), { ok: false });
    assert.equal(invitation.status, "pending");
});
test("new mutation error paths expose no Secret Circle or inviter metadata", async () => {
    state.indexes = false;
    await assert.rejects(subject.acceptSecretCircleInvitation(INVITATION_ID), (error: Error) => {
        assert.doesNotMatch(error.message, /Hidden|inviter|did:/i);
        return true;
    });
});
