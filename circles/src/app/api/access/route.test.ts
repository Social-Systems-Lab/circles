import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import type { Circle, Member } from "@/models/models";
import { canReadCircle } from "@/lib/data/circle-visibility-policy";
import { createAccessPostHandler } from "./handler";
import { errors } from "jose";

const circleId = new ObjectId().toHexString();
const baseCircle: Circle = {
    _id: circleId,
    circleType: "circle",
    publishStatus: "published",
    moderationStatus: "active",
    enabledModules: ["feed"],
    accessRules: { feed: { view: ["everyone"] } },
};

type Scenario = {
    circle?: Circle | null;
    viewerDid?: string;
    memberGroups?: string[];
    member?: boolean;
    invalidSession?: boolean;
    canEditAbout?: boolean;
};

const makeHandler = ({
    circle = baseCircle,
    viewerDid,
    member = false,
    memberGroups = member ? ["members"] : undefined,
    invalidSession = false,
    canEditAbout = false,
}: Scenario) => {
    const canonicalMember: Member | null =
        memberGroups && viewerDid ? { userDid: viewerDid, circleId, userGroups: memberGroups, joinedAt: new Date() } : null;
    return createAccessPostHandler({
        authenticate: async () => {
            if (invalidSession) throw new errors.JWTInvalid("invalid session");
            return viewerDid;
        },
        findCircle: async () => circle,
        canReadCircle: (did, candidate) =>
            canReadCircle(did, candidate, {
                getMember: async (memberDid, memberCircleId) =>
                    canonicalMember?.userDid === memberDid && canonicalMember.circleId === memberCircleId
                        ? canonicalMember
                        : null,
            }),
        getMember: async () => canonicalMember,
        canEditAbout: async () => canEditAbout,
        isCirclePublished: (candidate) => candidate.publishStatus === "published",
        isModuleEnabled: (candidate, moduleHandle) => candidate.enabledModules?.includes(moduleHandle) === true,
    });
};

const invoke = (scenario: Scenario, moduleHandle = "feed", settingsEditor?: string) =>
    makeHandler(scenario)(
        new Request("http://localhost/api/access", {
            method: "POST",
            body: JSON.stringify({ circleHandle: "target", moduleHandle, settingsEditor }),
        }),
    );

const neutral = async (response: Response) => ({ status: response.status, body: await response.json() });

async function main() {
    const oversizedRequest = new Request("http://localhost/api/access", {
        method: "POST",
        body: JSON.stringify({ value: "x".repeat(9 * 1024) }),
    });
    const oversizedResponse = await makeHandler({})(oversizedRequest);
    assert.equal(oversizedResponse.status, 413, "oversized JSON is rejected before access checks run");

    const expectedNeutral = await neutral(await invoke({ circle: null }));
    assert.deepEqual(expectedNeutral, {
        status: 404,
        body: { notFound: true, notFoundType: "circle" },
    });

    const secretCircle: Circle = { ...baseCircle, visibility: "secret" };
    for (const scenario of [
        { circle: secretCircle },
        { circle: secretCircle, invalidSession: true },
        { circle: secretCircle, viewerDid: "did:outsider" },
        { circle: secretCircle, viewerDid: "did:superadmin" },
        {
            circle: { ...secretCircle, moderationStatus: "suspended" as const },
            viewerDid: "did:member",
            member: true,
        },
        {
            circle: { ...secretCircle, moderationStatus: "removed" as const },
            viewerDid: "did:member",
            member: true,
        },
    ]) {
        assert.deepEqual(await neutral(await invoke(scenario)), expectedNeutral);
    }

    for (const moderationStatus of ["active", "paused"] as const) {
        const response = await invoke({
            circle: { ...secretCircle, moderationStatus },
            viewerDid: "did:member",
            member: true,
        });
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { authenticated: true, authorized: true });
    }

    const legacyPublicResponse = await invoke({ circle: { ...baseCircle, visibility: undefined } });
    assert.equal(legacyPublicResponse.status, 200);
    assert.deepEqual(await legacyPublicResponse.json(), { authenticated: true, authorized: true });

    const draft: Circle = { ...baseCircle, publishStatus: "draft" };
    assert.deepEqual(await neutral(await invoke({ circle: draft })), expectedNeutral);
    assert.deepEqual(await neutral(await invoke({ circle: draft, viewerDid: "did:outsider" })), expectedNeutral);
    assert.equal((await invoke({ circle: { ...draft, createdBy: "did:creator" }, viewerDid: "did:creator" })).status, 200);
    assert.equal((await invoke({ circle: draft, viewerDid: "did:admin", memberGroups: ["admins"] })).status, 200);

    const settings: Circle = { ...baseCircle, enabledModules: ["settings"] };
    for (const [scenario, expected] of [
        [{ circle: settings }, { authenticated: false, authorized: false }],
        [{ circle: settings, viewerDid: "did:outsider" }, { authenticated: true, authorized: false }],
        [{ circle: settings, viewerDid: "did:member", member: true }, { authenticated: true, authorized: false }],
        [{ circle: settings, viewerDid: "did:admin", memberGroups: ["admins"] }, { authenticated: true, authorized: true }],
        [
            { circle: { ...settings, accessRules: { settings: { view: ["members"] } } }, viewerDid: "did:member", member: true },
            { authenticated: true, authorized: true },
        ],
        [
            { circle: { ...settings, accessRules: { settings: { view: ["everyone"] } } } },
            { authenticated: false, authorized: false },
        ],
        [
            { circle: { ...settings, visibility: "secret", accessRules: { settings: { view: ["everyone"] } } }, viewerDid: "did:outsider" },
            expectedNeutral.body,
        ],
    ] satisfies Array<[Scenario, unknown]>) {
        assert.deepEqual(await (await invoke(scenario, "settings")).json(), expected);
    }

    const legacySettings: Circle = { ...settings, accessRules: { settings: { edit_about: ["editors", "admins"] } } };
    const editor: Scenario = { circle: legacySettings, viewerDid: "did:editor", memberGroups: ["editors"], canEditAbout: true };
    const settingsResponse = async (scenario: Scenario, page?: string) =>
        neutral(await invoke(scenario, "settings", page));
    const allowed = { status: 200, body: { authenticated: true, authorized: true } };
    const denied = { status: 200, body: { authenticated: true, authorized: false } };

    for (const page of ["about", "presence"]) {
        assert.deepEqual(await settingsResponse(editor, page), allowed);
        assert.deepEqual(await settingsResponse({ ...editor, viewerDid: undefined }, page), {
            status: 200,
            body: { authenticated: false, authorized: false },
        });
        assert.deepEqual(await settingsResponse({ ...editor, memberGroups: ["members"], canEditAbout: false }, page), denied);
        assert.deepEqual(await settingsResponse({ ...editor, circle: settings }, page), denied);
        for (const view of [[], ["admins"], ["editors"]]) {
            const circle: Circle = {
                ...legacySettings,
                accessRules: { settings: { ...legacySettings.accessRules?.settings, view } },
            };
            assert.deepEqual(await settingsResponse({ ...editor, circle }, page), view.includes("editors") ? allowed : denied);
        }
        assert.deepEqual(await settingsResponse({ ...editor, circle: { ...legacySettings, publishStatus: "draft" } }, page), expectedNeutral);
        assert.deepEqual(await settingsResponse({ ...editor, circle: { ...legacySettings, publishStatus: "draft", createdBy: editor.viewerDid } }, page), allowed);
        const secret: Circle = { ...legacySettings, visibility: "secret" };
        assert.deepEqual(await settingsResponse({ ...editor, circle: secret, memberGroups: undefined }, page), expectedNeutral);
        assert.deepEqual(await settingsResponse({ ...editor, circle: secret }, page), allowed);
        const profile: Circle = { ...legacySettings, circleType: "user", did: "did:owner" };
        assert.deepEqual(await settingsResponse({ ...editor, circle: profile }, page), denied);
        assert.deepEqual(await settingsResponse({ ...editor, circle: profile, viewerDid: profile.did }, page), allowed);
    }
    for (const page of [undefined, "general", "access-rules"]) {
        assert.deepEqual(await settingsResponse(editor, page), denied);
        assert.deepEqual(await settingsResponse({ ...editor, memberGroups: ["admins"] }, page), allowed);
    }

    console.log("access route handler tests passed");
}

void main();
