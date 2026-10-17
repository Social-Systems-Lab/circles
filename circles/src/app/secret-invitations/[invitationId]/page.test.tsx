import assert from "node:assert/strict";
// @ts-expect-error Bun's runtime test module is available even though this repository does not install its types.
import { beforeEach, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

const state: {
    viewer?: string;
    invitation: null | { status: "accepted"; circle: { handle: string } };
    redirectTarget?: string;
} = {
    viewer: "did:recipient",
    invitation: { status: "accepted", circle: { handle: "hidden" } },
};

mock.module("@/lib/auth/auth", () => ({ getAuthenticatedUserDid: async () => state.viewer }));
mock.module("@/lib/data/secret-circle-invitations", () => ({
    inspectSecretCircleInvitation: async () => state.invitation,
    acceptSecretCircleInvitation: async () => ({ ok: false }),
}));
mock.module("next/navigation", () => ({
    redirect: (target: string) => {
        state.redirectTarget = target;
        throw new Error("NEXT_REDIRECT");
    },
}));

const { default: SecretInvitationPage } = await import("./page");

beforeEach(() => {
    state.viewer = "did:recipient";
    state.invitation = { status: "accepted", circle: { handle: "hidden" } };
    state.redirectTarget = undefined;
});

test("accepted invitation immediately redirects to its Circle and never to root", async () => {
    await assert.rejects(
        SecretInvitationPage({ params: Promise.resolve({ invitationId: "64b000000000000000000002" }) }),
        /NEXT_REDIRECT/,
    );
    assert.equal(state.redirectTarget, "/circles/hidden");
});

test("logged-out invitation keeps the generic sign-in state without inspection metadata", async () => {
    state.viewer = undefined;
    state.invitation = null;
    const page = await SecretInvitationPage({
        params: Promise.resolve({ invitationId: "not-a-valid-object-id" }),
    });
    const html = renderToStaticMarkup(page);
    assert.match(html, /Private Circle invitation/);
    assert.match(html, /Sign in to view this private invitation\./);
    assert.doesNotMatch(html, /hidden|Open Circle/);
});

test("unavailable authenticated invitation stays neutral", async () => {
    state.invitation = null;
    const page = await SecretInvitationPage({
        params: Promise.resolve({ invitationId: "64b000000000000000000099" }),
    });
    const html = renderToStaticMarkup(page);
    assert.match(html, /Private invitation unavailable/);
    assert.doesNotMatch(html, /hidden|Open Circle/);
});
