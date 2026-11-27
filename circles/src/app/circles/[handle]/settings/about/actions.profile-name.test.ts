import assert from "node:assert/strict";
// @ts-expect-error Bun provides its test APIs at runtime.
import { beforeEach, mock, test } from "bun:test";

const state = {
    circle: {
        _id: "personal-profile-id",
        did: "did:profile-owner",
        handle: "existing-handle",
        name: "Historical Name",
        circleType: "user",
    } as Record<string, unknown>,
    updates: [] as Array<Record<string, unknown>>,
    paths: [] as string[],
    viewerDid: "did:profile-owner" as string | undefined,
    canEdit: true,
    groups: ["admins"],
};

mock.module("@/lib/auth/auth", () => ({
    getAuthenticatedUserDid: async () => state.viewerDid,
    isAuthorized: async () => state.canEdit,
}));
mock.module("@/lib/data/circle", () => ({
    getCircleByHandle: async () => undefined,
    getCircleById: async () => state.circle,
    isCirclePublished: () => true,
    getCirclePath: async (circle: { handle: string }) => `/circles/${circle.handle}/`,
    updateCircle: async (update: Record<string, unknown>) => {
        state.updates.push(update);
    },
}));
mock.module("@/lib/data/circle-attach", () => ({
    approveAttachCircleRequest: async () => undefined,
    createAttachCircleRequest: async () => undefined,
    declineAttachCircleRequest: async () => undefined,
}));
mock.module("@/lib/data/circle-detach", () => ({
    approveDetachCircleRequest: async () => undefined,
    createDetachCircleRequest: async () => undefined,
    declineDetachCircleRequest: async () => undefined,
}));
mock.module("@/lib/data/user", () => ({
    getUserPrivate: async () => undefined,
}));
mock.module("@/lib/data/verification-workflow", () => ({
    addApplicantVerificationMessage: async () => undefined,
    createVerificationRequest: async () => undefined,
    getActiveVerificationRequestForIndependentCircle: async () => undefined,
    getIndependentCircleVerificationThread: async () => undefined,
    getVerificationAdmins: async () => [],
    notifyAdminsOfApplicantVerificationReply: async () => undefined,
}));
mock.module("@/lib/data/notifications", () => ({
    sendAttachCircleRequestNotification: async () => undefined,
    sendDetachCircleRequestNotification: async () => undefined,
    sendVerificationRequestNotification: async () => undefined,
}));
mock.module("@/lib/data/member", () => ({
    getMembers: async () => [],
    getMember: async () => ({ userGroups: state.groups }),
}));
mock.module("next/cache", () => ({ revalidatePath: (path: string) => state.paths.push(path) }));
mock.module("@/lib/data/storage", () => ({ isFile: () => false }));
mock.module("@/lib/data/circle-media-storage", () => ({
    canRetainSubmittedCircleMediaUrl: () => false,
    collectReplacedCircleMedia: () => [],
    persistCircleThenCleanupMedia: async (persist: () => Promise<void>) => {
        await persist();
        return { status: "success" };
    },
    saveCircleOwnedFile: async () => ({ url: "https://example.invalid/photo.jpg" }),
}));
mock.module("@/lib/utils/social-links", () => ({ sanitizeSocialLinks: (links: unknown) => links }));
mock.module("@/lib/verification-readiness", () => ({ getVerificationReadiness: () => ({ isReady: true }) }));
mock.module("@/lib/data/db", () => ({ Circles: {} }));
mock.module("@/lib/data/circle-lifecycle-policy", () => ({ assertCircleWritesAllowed: async () => undefined }));
mock.module("@/lib/location-privacy", () => ({
    preparePersonalLocationForSave: (location: unknown) => ({ valid: true, location }),
}));

const {
    addCircleAffiliationAction,
    getIndependentCircleVerificationThreadAction,
    publishCircleAction,
    replyToIndependentCircleVerificationThreadAction,
    removeCircleAffiliationAction,
    saveAbout,
    submitCircleForVerificationAction,
} = await import("./actions");

beforeEach(() => {
    state.circle = {
        _id: "personal-profile-id",
        did: "did:profile-owner",
        handle: "existing-handle",
        name: "Historical Name",
        circleType: "user",
    };
    state.updates = [];
    state.paths = [];
    state.viewerDid = "did:profile-owner";
    state.canEdit = true;
    state.groups = ["admins"];
});

const profileValues = (name: string, circleId = "personal-profile-id") => ({
    _id: circleId,
    name,
    handle: "existing-handle",
    description: "A profile introduction",
});

test("server action rejects invalid personal names without persistence", async () => {
    for (const name of ["", "   ", "\n\t", "N".repeat(101)]) {
        const result = await saveAbout(profileValues(name));

        assert.equal(result.success, false);
        assert.equal(result.message, "Enter your name (2–100 characters).");
        assert.deepEqual(state.updates, [], "invalid profile name must not reach database update");
    }
});

test("server action trims valid personal names and preserves the existing handle and DID", async () => {
    const result = await saveAbout(profileValues("  Jordan Member  "));

    assert.equal(result.success, true);
    assert.equal(state.updates.length, 1);
    assert.equal(state.updates[0].name, "Jordan Member");
    assert.equal(state.updates[0].handle, "existing-handle");
    assert.equal(Object.hasOwn(state.updates[0], "did"), false);
});

test("personal profiles with a missing legacy name can repair it", async () => {
    state.circle.name = undefined;
    const result = await saveAbout(profileValues("Repaired Name"));

    assert.equal(result.success, true);
    assert.equal(state.updates[0]?.name, "Repaired Name");
});

test("non-personal circle naming rules remain unchanged", async () => {
    state.circle = { _id: "circle-id", handle: "community", name: "Community", circleType: "circle" };
    const result = await saveAbout(profileValues("", "circle-id"));

    assert.equal(result.success, true);
    assert.equal(state.updates[0]?.name, "");
});


test("delegated editor can save About content without changing administrative settings", async () => {
    state.circle = {
        _id: "circle-id",
        handle: "community",
        circleType: "circle",
        accessRules: { settings: { edit_about: ["editors", "admins"] } },
    };
    state.viewerDid = "did:editor";
    state.groups = ["editors"];

    const protectedValues = {
        handle: "different-handle",
        isPublic: false,
        showAdminsPublicly: true,
        location: { street: "Fixture street" },
        representsOrganization: true,
        organizationName: "Fixture organisation",
        officialEmail: "organisation@example.invalid",
        websiteUrl: "https://example.invalid",
    };
    const result = await saveAbout({
        ...profileValues("Updated About", "circle-id"),
        ...protectedValues,
        mission: "Updated mission",
    });

    assert.equal(result.success, true);
    assert.equal(result.newHandle, undefined);
    assert.equal(state.updates.length, 1);
    assert.equal(state.updates[0].name, "Updated About");
    assert.equal(state.updates[0].mission, "Updated mission");
    for (const field of Object.keys(protectedValues)) assert.equal(Object.hasOwn(state.updates[0], field), false);
    assert.deepEqual(state.paths, ["/circles/community/settings/about", "/circles/community/"]);
});

test("a scoped Edit About grant does not authorize administrative About actions", async () => {
    state.circle = {
        _id: "circle-id",
        circleType: "circle",
        circleLevel: "profile_child",
        accessRules: { settings: { edit_about: ["editors"] } },
    };
    state.viewerDid = "did:editor";
    state.groups = ["editors"];
    const formData = new FormData();
    formData.set("circleId", "circle-id");
    const results = await Promise.all([
        publishCircleAction(formData),
        submitCircleForVerificationAction(formData),
        replyToIndependentCircleVerificationThreadAction(formData),
        addCircleAffiliationAction("circle-id", "other-circle"),
        removeCircleAffiliationAction("circle-id", "other-circle-id"),
    ]);
    for (const result of results) assert.match(result.message ?? "", /not authorized/);
    await assert.rejects(getIndependentCircleVerificationThreadAction("circle-id"), /Unauthorized/);
    assert.deepEqual(state.updates, []);
});

test("anonymous visitors and members without Edit About cannot save", async () => {
    state.viewerDid = undefined;
    assert.equal((await saveAbout(profileValues("Anonymous"))).success, false);
    state.viewerDid = "did:ordinary-member";
    state.canEdit = false;
    assert.equal((await saveAbout(profileValues("Member"))).success, false);
    assert.deepEqual(state.updates, []);
});
