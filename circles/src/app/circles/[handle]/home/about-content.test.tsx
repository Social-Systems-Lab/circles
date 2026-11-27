import assert from "node:assert/strict";
import React from "react";
// @ts-expect-error Bun provides its test APIs at runtime.
import { mock, test } from "bun:test";
import { ObjectId } from "mongodb";
import { renderToStaticMarkup } from "react-dom/server";
import type { Circle } from "@/models/models";

const id = new ObjectId().toHexString();
const owner = "did:fixture:owner";
const admin = "did:fixture:admin";
const editor = "did:fixture:editor";
const member = "did:fixture:member";
const outsider = "did:fixture:outsider";
const memberships: Record<string, string[]> = {
    [owner]: ["admins"],
    [admin]: ["admins"],
    [editor]: ["editors"],
    [member]: ["members"],
};
const baseCircle: Circle = {
    _id: id,
    name: "Fixture Circle",
    handle: "fixture",
    createdBy: owner,
    circleType: "circle",
    description: "A distinct short description",
    mission: "A distinct mission",
    publishStatus: "published",
    enabledModules: ["home", "settings"],
    showAdminsPublicly: false,
};
const historical = "**Historical About**\nSecond line\n\n- First item";
const state: { circle: Circle; viewerDid?: string; content?: string; contentReads: number } = {
    circle: baseCircle,
    content: historical,
    contentReads: 0,
};
const getMember = async (did: string, circleId: string) => (
    memberships[did] && circleId === id ? { circleId, userDid: did, userGroups: memberships[did] } : null
);

const navigation = await import("next/navigation");
const circleData = await import("@/lib/data/circle");
const memberData = await import("@/lib/data/member");
const auth = await import("@/lib/auth/auth");
const attach = await import("@/lib/data/circle-attach");
const detach = await import("@/lib/data/circle-detach");
const proofOfHumanity = await import("@/lib/data/proof-of-humanity");
mock.module("next/navigation", () => ({ ...navigation, useRouter: () => ({ push: () => undefined }) }));
mock.module("@/lib/auth/auth", () => ({
    ...auth,
    getAuthenticatedUserDid: async () => state.viewerDid,
    isAuthorized: async (did: string) => (
        memberships[did]?.some((group) => (state.circle.accessRules?.settings?.edit_about ?? ["admins"]).includes(group)) ?? false
    ),
}));
mock.module("@/lib/data/circle", () => ({
    ...circleData,
    getCircleByHandle: async () => state.circle,
    getCircleAboutContent: async (circleId: string) => {
        assert.equal(circleId, id);
        state.contentReads++;
        return state.content;
    },
    getCirclePublishStatus: (circle: Circle) => circle.publishStatus ?? "published",
    isCirclePublished: (circle: Circle) => circle.publishStatus === "published",
    getDiscoverableAffiliatedCirclesForCircle: async () => [],
    getDiscoverableCirclesByIds: async () => [],
}));
mock.module("@/lib/data/member", () => ({ ...memberData, getMember, getMembers: async () => [] }));
mock.module("@/lib/data/circle-attach", () => ({
    ...attach,
    getPendingAttachCircleRequest: async () => null,
    getPendingIncomingAttachCircleRequests: async () => [],
}));
mock.module("@/lib/data/circle-detach", () => ({ ...detach, getPendingDetachCircleRequest: async () => null }));
mock.module("@/lib/data/proof-of-humanity", () => ({
    ...proofOfHumanity,
    getHumanityVerificationSummary: async () => null,
}));
mock.module("./profile-contribution-panel-data", () => ({
    getProfileContributionPanelData: async () => ({ items: [], totalPublicCount: 0 }),
}));
mock.module("@/components/forms/circle-settings/about-settings-form", () => ({
    AboutSettingsForm: ({ circle, delegated }: { circle: Circle; delegated?: boolean }) => (
        <pre>{JSON.stringify({ content: circle.content, delegated })}</pre>
    ),
}));

const { default: HomePage } = await import("./page");
const { default: AboutSettingsPage } = await import("../settings/about/page");
const props = { params: Promise.resolve({ handle: "fixture" }), searchParams: Promise.resolve({}) };
const notFound = { digest: "NEXT_HTTP_ERROR_FALLBACK;404" };

function setViewer(circle: Partial<Circle>, viewerDid?: string) {
    state.circle = { ...baseCircle, ...circle };
    state.viewerDid = viewerDid;
    state.content = historical;
    state.contentReads = 0;
}

test("Home renders historical Markdown, including line breaks, for each circle category", async () => {
    for (const circle of [
        { circleType: "user", did: owner },
        { circleLevel: "top_level" },
        { circleLevel: "profile_child", parentCircleId: "parent-id" },
    ] as const) {
        setViewer(circle);
        const markup = renderToStaticMarkup(await HomePage(props));
        assert.match(markup, /<strong>Historical About<\/strong><br\s*\/>\s*Second line/);
        assert.match(markup, /First item/);
        assert.match(markup, /A distinct mission/);
        assert.doesNotMatch(markup, /A distinct short description/);
        assert.equal(state.contentReads, 1);
    }
});

test("empty Content has its own empty state and retains the editor link", async () => {
    setViewer({}, admin);
    state.content = " \n ";
    const markup = renderToStaticMarkup(await HomePage(props));
    assert.match(markup, /No About text yet/);
    assert.match(markup, />Edit<\/button>/);
    assert.doesNotMatch(markup, /A distinct short description/);
});

test("Home never reads Content before the circle and Home module permissions pass", async () => {
    const restricted: Partial<Circle> = { accessRules: { home: { view: ["members"] } } };
    for (const [circle, viewer] of [
        [restricted, undefined],
        [restricted, outsider],
        [{ visibility: "secret" }, outsider],
        [{ visibility: "secret" }, undefined],
        [{ enabledModules: ["settings"] }, admin],
        [{ publishStatus: "draft", accessRules: { settings: { edit_about: ["editors"] } } }, editor],
    ] as Array<[Partial<Circle>, string | undefined]>) {
        setViewer(circle, viewer);
        await assert.rejects(HomePage(props), notFound);
        assert.equal(state.contentReads, 0);
    }
    for (const circle of [restricted, { visibility: "secret" } as const]) {
        setViewer(circle, member);
        assert.match(renderToStaticMarkup(await HomePage(props)), /Historical About/);
        assert.equal(state.contentReads, 1);
    }
});

test("About settings load stored Content for owners, admins and delegated About editors", async () => {
    setViewer({ circleType: "user", did: owner }, owner);
    const personalSettings = await AboutSettingsPage(props);
    assert.equal(personalSettings.props.children.at(-1).props.circle.content, historical);

    setViewer({ visibility: "secret" }, admin);
    const adminSettings = await AboutSettingsPage(props);
    assert.equal(adminSettings.props.children.at(-1).props.circle.content, historical);

    const delegated: Partial<Circle> = { accessRules: { settings: { edit_about: ["editors"] } } };
    setViewer(delegated, editor);
    const markup = renderToStaticMarkup(await AboutSettingsPage(props));
    assert.match(markup, /Historical About/);
    assert.match(markup, /&quot;delegated&quot;:true/);

    for (const viewer of [undefined, outsider, member]) {
        setViewer(delegated, viewer);
        await assert.rejects(AboutSettingsPage(props), notFound);
        assert.equal(state.contentReads, 0);
    }
});
