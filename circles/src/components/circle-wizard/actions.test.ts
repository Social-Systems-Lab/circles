import assert from "node:assert/strict";
// @ts-expect-error Bun provides module mocking at runtime; this repository does not install Bun type declarations.
import { mock, test } from "bun:test";
import type { Circle } from "@/models/models";
import type { CircleData } from "./circle-wizard";

const ordinaryDid = "did:example:ordinary";
const superadminDid = "did:example:superadmin";
let authenticatedDid: string | undefined = ordinaryDid;
let currentUser: Circle = {
    did: ordinaryDid,
    circleType: "user",
    isAdmin: false,
    isEmailVerified: true,
    isMember: true,
    accountStatus: "active",
    picture: { url: "/storage/profile.png" },
    description: "Complete profile",
    communityGuidelinesAcceptance: {
        truth: { accepted: true, acceptedAt: new Date() },
        constructive: { accepted: true, acceptedAt: new Date() },
        respect: { accepted: true, acceptedAt: new Date() },
        privacy: { accepted: true, acceptedAt: new Date() },
        responsibility: { accepted: true, acceptedAt: new Date() },
    },
};
let created: { circle: Circle; authenticatedUserDid: string } | undefined;
let failMembership = false;

mock.module("@/lib/auth/auth", () => ({
    getAuthenticatedUserDid: async () => authenticatedDid,
    isAuthorized: async () => true,
}));
mock.module("@/lib/data/user", () => ({
    getUser: async () => undefined,
    getUserPrivate: async () => currentUser,
}));
mock.module("@/lib/data/circle", () => ({
    updateCircle: async () => undefined,
    getCircleById: async () => undefined,
    ensureModuleIsEnabledOnCircle: async () => undefined,
    getCircleByHandle: async () => undefined,
    getCirclePath: async () => "",
}));
mock.module("@/lib/data/constants", () => ({
    features: {
        settings: { edit_about: "edit_about" },
        projects: { create: "create" },
        communities: { create: "create" },
    },
}));
mock.module("@/lib/data/storage", () => ({ isFile: () => false }));
mock.module("@/lib/data/circle-media-storage", () => ({
    canRetainSubmittedCircleMediaUrl: () => false,
    collectReplacedCircleMedia: () => [],
    persistCircleThenCleanupMedia: async () => undefined,
    saveCircleOwnedFile: async () => undefined,
}));
mock.module("@/lib/data/circle-creation", () => ({
    createCircleWithCanonicalCreatorMembership: async (circle: Circle, authenticatedUserDid: string) => {
        created = { circle: structuredClone(circle), authenticatedUserDid };
        if (circle.visibility === "secret" && authenticatedUserDid !== superadminDid) {
            throw new Error("Unauthorized: secret circle visibility requires superadmin access.");
        }
        if (circle.visibility === "secret" && circle.circleType === "user") {
            throw new Error("Unauthorized: user profile Circles cannot be secret.");
        }
        if (failMembership) throw new Error("membership insert failed");
        return { circle: { ...circle, _id: "507f1f77bcf86cd799439011" }, membership: {} };
    },
}));
mock.module("next/cache", () => ({ revalidatePath: () => undefined }));

const { createCircleAction, saveBasicInfoAction } = await import("./actions");

const setActor = (did: string, isAdmin: boolean) => {
    authenticatedDid = did;
    currentUser = { ...currentUser, did, isAdmin };
    created = undefined;
    failMembership = false;
};

const circleData = (overrides: Partial<CircleData> = {}): CircleData => ({
    name: "Created Circle",
    handle: "created-circle",
    isPublic: true,
    visibility: "public",
    mission: "Mission",
    description: "Description",
    content: "Content",
    selectedSdgs: [],
    selectedSkills: [],
    picture: "/storage/client-picture.png",
    images: [{ url: "/storage/client-gallery.png" }],
    circleLevel: "top_level",
    circleType: "circle",
    ...overrides,
});

test("create Circle actions enforce authenticated identity, visibility policy, and an explicit input allowlist", async () => {
    setActor(ordinaryDid, false);
    let result: { success: boolean; message: string } = await saveBasicInfoAction(
        "Forged Secret",
        "forged-secret",
        true,
        undefined,
        undefined,
        "circle",
        "top_level",
        undefined,
        false,
        undefined,
        undefined,
        "secret",
    );
    assert.equal(result.success, false, "an authenticated ordinary user cannot forge Secret creation");
    assert.equal(created?.authenticatedUserDid, ordinaryDid, "authorization uses the authenticated DID");

    setActor(superadminDid, true);
    result = await saveBasicInfoAction(
        "Secret",
        "secret",
        true,
        undefined,
        undefined,
        "circle",
        "top_level",
        undefined,
        false,
        undefined,
        undefined,
        "secret",
    );
    assert.equal(result.success, true, "an authenticated superadmin can create a Secret Circle");
    assert.deepEqual(created?.circle.picture, { url: "/images/default-picture.png" });
    assert.deepEqual(created?.circle.images, []);

    setActor(ordinaryDid, false);
    result = await createCircleAction(circleData({ visibility: "secret" }), superadminDid);
    assert.equal(result.success, false, "an ordinary authenticated user cannot forge Secret creation");
    assert.equal(created?.authenticatedUserDid, ordinaryDid, "the _userDid argument cannot grant Secret authorization");

    setActor(superadminDid, true);
    result = await createCircleAction(circleData({ visibility: "secret", circleType: "user" }), superadminDid);
    assert.equal(result.success, false, "user/profile Secret creation is rejected");

    setActor(superadminDid, true);
    result = await createCircleAction(circleData({ visibility: "secret" }), ordinaryDid);
    assert.equal(result.success, true);
    assert.deepEqual(created?.circle.picture, { url: "/images/default-picture.png" });
    assert.deepEqual(created?.circle.images, [], "Secret creation discards all client-supplied gallery media");
    assert.equal(created?.authenticatedUserDid, superadminDid);

    setActor(ordinaryDid, false);
    result = await createCircleAction(
        {
            ...circleData({
                websiteUrl: "example.org",
                representsOrganization: true,
                organizationName: "  Example Org  ",
                officialEmail: " ADMIN@EXAMPLE.ORG ",
            }),
            createdBy: "attacker-did",
            enabledModules: ["admin"],
            moderationStatus: "approved",
        } as CircleData,
        "did:example:ignored",
    );
    assert.equal(result.success, true, "public creation remains allowed");
    assert.equal(created?.circle.createdBy, ordinaryDid, "createdBy comes only from the authenticated DID");
    assert.equal(created?.circle.name, "Created Circle", "legitimate wizard fields persist");
    assert.equal(created?.circle.websiteUrl, "https://example.org");
    assert.equal(created?.circle.representsOrganization, true);
    assert.equal(created?.circle.organizationName, "Example Org");
    assert.equal(created?.circle.officialEmail, "admin@example.org");
    assert.deepEqual(created?.circle.picture, { url: "/storage/client-picture.png" });
    assert.deepEqual(
        created?.circle.images,
        [{ url: "/storage/client-gallery.png" }],
        "public gallery behavior is unchanged",
    );
    assert.equal(
        created?.circle.enabledModules,
        undefined,
        "forged enabledModules is discarded at the action boundary",
    );
    assert.equal(
        created?.circle.moderationStatus,
        undefined,
        "forged moderationStatus is discarded at the action boundary",
    );

    setActor(superadminDid, true);
    failMembership = true;
    result = await createCircleAction(circleData({ visibility: "secret" }), superadminDid);
    assert.equal(result.success, false, "membership insertion failure must not falsely report success");
    assert.match(result.message, /membership insert failed/);
});
