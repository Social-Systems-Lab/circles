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
    member?: boolean;
    invalidSession?: boolean;
};

const makeHandler = ({ circle = baseCircle, viewerDid, member = false, invalidSession = false }: Scenario) => {
    const canonicalMember: Member | null = member && viewerDid
        ? { userDid: viewerDid, circleId, userGroups: ["members"], joinedAt: new Date() }
        : null;
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
        isCirclePublished: (candidate) => candidate.publishStatus === "published",
        isModuleEnabled: (candidate, moduleHandle) => candidate.enabledModules?.includes(moduleHandle) === true,
    });
};

const invoke = (scenario: Scenario) =>
    makeHandler(scenario)(
        new Request("http://localhost/api/access", {
            method: "POST",
            body: JSON.stringify({ circleHandle: "target", moduleHandle: "feed" }),
        }),
    );

const neutral = async (response: Response) => ({ status: response.status, body: await response.json() });

async function main() {
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

    console.log("access route handler tests passed");
}

void main();
