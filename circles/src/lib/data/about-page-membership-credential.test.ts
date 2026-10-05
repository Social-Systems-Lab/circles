import assert from "node:assert/strict";
import { test } from "node:test";
// @ts-expect-error Bun provides module mocking at runtime; this repository does not install Bun type declarations.
import { mock } from "bun:test";
import type { Circle, Member, UserPrivate } from "@/models/models";
import type { CircleMembershipCredentialCardData } from "@/lib/vibe-id/membership-credentials";
import type { AboutPageMembershipCredentialDependencies } from "./about-page-membership-credential";

mock.module("server-only", () => ({}));

const { resolveAboutPageMembershipCredential } = await import("./about-page-membership-credential");
const { buildAboutPageClientProps } = await import("./client-circle-dto");

const VIEWER_DID = "did:example:authenticated-viewer";
const LINKED_VIBE_DID = "did:vibe:authenticated-viewer";
const CIRCLE_ID = "circle-id";
const FOREIGN_CREDENTIAL_SENTINEL = "foreign-credential-private-sentinel";
const FORGED_CONTEXT_SENTINEL = "forged-caller-authorization-sentinel";

const circle = {
    _id: CIRCLE_ID,
    did: "did:example:circle",
    name: "Synthetic Circle",
    handle: "synthetic-circle",
    circleType: "circle",
} as Circle;

const member = {
    _id: "membership-id",
    userDid: VIEWER_DID,
    circleId: CIRCLE_ID,
    userGroups: ["members"],
    joinedAt: new Date("2026-01-01T00:00:00.000Z"),
} as Member;

const viewer = {
    _id: "viewer-id",
    did: VIEWER_DID,
    circleType: "user",
    name: "Synthetic Viewer",
    handle: "synthetic-viewer",
    metadata: { authProviders: { vibeId: { did: LINKED_VIBE_DID } } },
    memberships: [],
    friends: [],
    pendingRequests: [],
    chatRoomMemberships: [],
} as unknown as UserPrivate;

const credential: CircleMembershipCredentialCardData = {
    circleName: "Synthetic Circle",
    circleHandle: "synthetic-circle",
    credentialId: "credential-id",
    issuedAt: "2026-01-01T00:00:00.000Z",
    expiresAt: null,
    subjectDid: LINKED_VIBE_DID,
    issuer: "did:web:issuer.example.test",
    deepLinkUrl: "https://example.test/claim",
    credentialUrl: "https://example.test/credential",
    statusUrl: "https://example.test/status",
};

const foreignCredential = (): CircleMembershipCredentialCardData => ({
    ...credential,
    credentialId: FOREIGN_CREDENTIAL_SENTINEL,
    subjectDid: "did:vibe:foreign-user",
    deepLinkUrl: `https://example.test/${FOREIGN_CREDENTIAL_SENTINEL}`,
});

const dependencies = (
    overrides: Partial<AboutPageMembershipCredentialDependencies> = {},
): AboutPageMembershipCredentialDependencies => ({
    authenticate: async () => VIEWER_DID,
    findMember: async () => member,
    findPrivateUser: async () => viewer,
    getLinkedIdentity: () => LINKED_VIBE_DID,
    createCredential: () => credential,
    createHandoff: async () => ({
        token: "opaque-token",
        subjectVibeDid: LINKED_VIBE_DID,
        deepLinkUrl: credential.deepLinkUrl,
        credentialUrl: credential.credentialUrl,
    }),
    ...overrides,
});

const assertRejectedBrowserOutput = async (
    deps: AboutPageMembershipCredentialDependencies,
    attemptedCircle: Circle = circle,
) => {
    const resolved = await resolveAboutPageMembershipCredential(attemptedCircle, deps);
    assert.equal(resolved, null);
    const browserOutput = buildAboutPageClientProps({
        circle: attemptedCircle,
        membershipCredential: resolved,
        fundingPanelVisibility: "members_only",
        upcomingShiftsVisibility: "members_only",
    });
    const serialized = JSON.stringify(browserOutput);
    assert.equal(serialized.includes(FOREIGN_CREDENTIAL_SENTINEL), false);
    assert.equal(serialized.includes(FORGED_CONTEXT_SENTINEL), false);
};

test("anonymous viewer cannot serialize an attempted foreign credential", async () => {
    const attemptedCredential = foreignCredential();
    assert.equal(JSON.stringify(attemptedCredential).includes(FOREIGN_CREDENTIAL_SENTINEL), true);
    await assertRejectedBrowserOutput(
        dependencies({
            authenticate: async () => undefined,
            createCredential: () => attemptedCredential,
        }),
    );
});

test("authenticated viewer with no canonical membership cannot serialize an attempted foreign credential", async () => {
    const attemptedCredential = foreignCredential();
    assert.equal(JSON.stringify(attemptedCredential).includes(FOREIGN_CREDENTIAL_SENTINEL), true);
    await assertRejectedBrowserOutput(
        dependencies({
            authenticate: async () => VIEWER_DID,
            findMember: async () => null,
            createCredential: () => attemptedCredential,
        }),
    );
});

test("an unrelated authenticated viewer cannot use another user's private record", async () => {
    await assertRejectedBrowserOutput(
        dependencies({
            authenticate: async () => "did:example:unrelated-viewer",
            findMember: async () => member,
            findPrivateUser: async () => viewer,
        }),
    );
});

test("membership with the wrong user DID fails closed", async () => {
    await assertRejectedBrowserOutput(
        dependencies({ findMember: async () => ({ ...member, userDid: "did:example:other-user" }) }),
    );
});

test("membership with the wrong Circle ID fails closed", async () => {
    await assertRejectedBrowserOutput(
        dependencies({ findMember: async () => ({ ...member, circleId: "other-circle-id" }) }),
    );
});

test("private user record with the wrong DID fails closed", async () => {
    await assertRejectedBrowserOutput(
        dependencies({ findPrivateUser: async () => ({ ...viewer, did: "did:example:other-user" }) }),
    );
});

test("missing linked Vibe identity fails closed", async () => {
    await assertRejectedBrowserOutput(dependencies({ getLinkedIdentity: () => null }));
});

test("credential whose subject does not match the linked identity fails closed", async () => {
    const attemptedCredential = foreignCredential();
    await assertRejectedBrowserOutput(dependencies({ createCredential: () => attemptedCredential }));
});

test("missing, null, empty, and non-string credential subjects fail closed", async () => {
    const { subjectDid: _removedSubject, ...withoutSubject } = foreignCredential();
    const malformedCredentials = [
        withoutSubject,
        { ...foreignCredential(), subjectDid: null },
        { ...foreignCredential(), subjectDid: "" },
        { ...foreignCredential(), subjectDid: 42 },
    ] as unknown as CircleMembershipCredentialCardData[];

    for (const attemptedCredential of malformedCredentials) {
        assert.equal(JSON.stringify(attemptedCredential).includes(FOREIGN_CREDENTIAL_SENTINEL), true);
        await assertRejectedBrowserOutput(dependencies({ createCredential: () => attemptedCredential }));
    }
});

test("membership lookup exceptions fail closed", async () => {
    await assertRejectedBrowserOutput(
        dependencies({
            findMember: async () => {
                throw new Error("synthetic membership lookup failure");
            },
        }),
    );
});

test("private-user lookup exceptions fail closed", async () => {
    await assertRejectedBrowserOutput(
        dependencies({
            findPrivateUser: async () => {
                throw new Error("synthetic private-user lookup failure");
            },
        }),
    );
});

test("credential construction exceptions fail closed", async () => {
    await assertRejectedBrowserOutput(
        dependencies({
            createCredential: () => {
                throw new Error("synthetic credential construction failure");
            },
        }),
    );
});

test("forged caller-supplied authorization context cannot substitute for authoritative identity", async () => {
    const attemptedCircle = {
        ...circle,
        viewerDid: VIEWER_DID,
        isAuthorized: true,
        subjectVibeDid: LINKED_VIBE_DID,
        membershipCredential: {
            ...credential,
            credentialId: FOREIGN_CREDENTIAL_SENTINEL,
            deepLinkUrl: FORGED_CONTEXT_SENTINEL,
        },
        authorizationContext: FORGED_CONTEXT_SENTINEL,
    } as unknown as Circle;
    await assertRejectedBrowserOutput(
        dependencies({
            authenticate: async () => "did:example:unrelated-viewer",
            findMember: async () => member,
            findPrivateUser: async () => viewer,
        }),
        attemptedCircle,
    );
});

test("a canonical authenticated member receives the unchanged membership card", async () => {
    let receivedUser: UserPrivate | undefined;
    const resolved = await resolveAboutPageMembershipCredential(
        circle,
        dependencies({
            getLinkedIdentity: (actualViewer) => {
                receivedUser = actualViewer;
                return LINKED_VIBE_DID;
            },
        }),
    );
    assert.equal(receivedUser, viewer);
    assert.deepEqual(resolved, credential);

    const browserOutput = buildAboutPageClientProps({
        circle,
        membershipCredential: resolved,
        fundingPanelVisibility: "visible",
        upcomingShiftsVisibility: "visible",
    });
    assert.deepEqual(browserOutput.membershipCredential, credential);
});
