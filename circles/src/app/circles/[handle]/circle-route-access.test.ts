import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import type { Circle, Member } from "@/models/models";
import { canReadCircle } from "@/lib/data/circle-visibility-policy";
import { resolveCircleRouteAccess, resolveCircleRouteMetadata } from "./circle-route-access";
import { errors } from "jose";

const circleId = new ObjectId().toHexString();
const secretCircle: Circle = {
    _id: circleId,
    circleType: "circle",
    visibility: "secret",
    moderationStatus: "active",
    name: "Hidden circle name",
    description: "Hidden circle description",
    parentCircleId: new ObjectId().toHexString(),
};
const genericCircle: Circle = { name: "Generic site", description: "Generic description" };

const dependencies = ({
    circle = secretCircle,
    viewerDid,
    member = false,
    invalidSession = false,
}: {
    circle?: Circle | null;
    viewerDid?: string;
    member?: boolean;
    invalidSession?: boolean;
}) => ({
    findCircle: async () => circle,
    authenticate: async () => {
        if (invalidSession) throw new errors.JWTInvalid("invalid session");
        return viewerDid;
    },
    canReadCircle: (did: string | undefined, candidate: Circle) =>
        canReadCircle(did, candidate, {
            getMember: async (memberDid, memberCircleId): Promise<Member | null> =>
                member && memberDid === viewerDid && memberCircleId === circleId
                    ? { userDid: memberDid, circleId: memberCircleId, userGroups: ["members"], joinedAt: new Date() }
                    : null,
        }),
    getGenericCircle: async () => genericCircle,
});

async function main() {
    assert.equal(await resolveCircleRouteAccess("missing", dependencies({ circle: null })), null);
    assert.equal(
        await resolveCircleRouteAccess("secret", dependencies({ viewerDid: "did:outsider" })),
        null,
    );
    assert.equal(
        await resolveCircleRouteAccess("secret", dependencies({ viewerDid: "did:superadmin" })),
        null,
    );

    const memberAccess = await resolveCircleRouteAccess(
        "secret",
        dependencies({ viewerDid: "did:member", member: true }),
    );
    assert.equal(memberAccess?.circle.name, secretCircle.name);

    const missingMetadata = await resolveCircleRouteMetadata("missing", dependencies({ circle: null }));
    for (const scenario of [
        dependencies({}),
        dependencies({ invalidSession: true }),
        dependencies({ viewerDid: "did:outsider" }),
        dependencies({ viewerDid: "did:superadmin" }),
        dependencies({
            circle: { ...secretCircle, moderationStatus: "suspended" },
            viewerDid: "did:member",
            member: true,
        }),
        dependencies({
            circle: { ...secretCircle, moderationStatus: "removed" },
            viewerDid: "did:member",
            member: true,
        }),
    ]) {
        const metadata = await resolveCircleRouteMetadata("secret", scenario);
        assert.deepEqual(metadata, missingMetadata);
        assert.doesNotMatch(JSON.stringify(metadata), /Hidden circle/);
    }

    const memberMetadata = await resolveCircleRouteMetadata(
        "secret",
        dependencies({ viewerDid: "did:member", member: true }),
    );
    assert.equal(memberMetadata.title, secretCircle.name);
    assert.equal(memberMetadata.description, secretCircle.description);

    const publicCircle: Circle = {
        ...secretCircle,
        visibility: undefined,
        name: "Public circle",
        description: "Public description",
    };
    const publicMetadata = await resolveCircleRouteMetadata("public", dependencies({ circle: publicCircle }));
    assert.equal(publicMetadata.title, publicCircle.name);
    assert.equal(publicMetadata.description, publicCircle.description);

    let protectedDetailsLoaded = false;
    const inaccessible = await resolveCircleRouteAccess("secret", {
        ...dependencies({ viewerDid: "did:outsider" }),
        canReadCircle: async () => false,
    });
    if (inaccessible) protectedDetailsLoaded = true;
    assert.equal(protectedDetailsLoaded, false, "layout cannot proceed to parent, hero, or detail loading");

    console.log("circle route access and metadata tests passed");
}

void main();
