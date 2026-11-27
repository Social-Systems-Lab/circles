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
    canEdit = false,
    invalidSession = false,
}: {
    circle?: Circle | null;
    viewerDid?: string;
    member?: boolean;
    canEdit?: boolean;
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
    isCirclePublished: (candidate: Circle) => (candidate.publishStatus ?? "published") === "published",
    canEditAbout: async () => canEdit,
});

const metadataFor = async (scenario: ReturnType<typeof dependencies>) =>
    resolveCircleRouteMetadata(await resolveCircleRouteAccess("fixture", scenario), async () => genericCircle);

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

    const missingMetadata = await metadataFor(dependencies({ circle: null }));
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
        const metadata = await metadataFor(scenario);
        assert.deepEqual(metadata, missingMetadata);
        assert.doesNotMatch(JSON.stringify(metadata), /Hidden circle/);
    }

    const memberMetadata = await metadataFor(dependencies({ viewerDid: "did:member", member: true }));
    assert.equal(memberMetadata.title, secretCircle.name);
    assert.equal(memberMetadata.description, secretCircle.description);

    const publicCircle: Circle = {
        ...secretCircle,
        visibility: undefined,
        name: "Public circle",
        description: "Public description",
    };
    const publicMetadata = await metadataFor(dependencies({ circle: publicCircle }));
    assert.equal(publicMetadata.title, publicCircle.name);
    assert.equal(publicMetadata.description, publicCircle.description);

    let protectedDetailsLoaded = false;
    const inaccessible = await resolveCircleRouteAccess("secret", {
        ...dependencies({ viewerDid: "did:outsider" }),
        canReadCircle: async () => false,
    });
    if (inaccessible) protectedDetailsLoaded = true;
    assert.equal(protectedDetailsLoaded, false, "layout cannot proceed to parent, hero, or detail loading");

    const draft: Circle = { ...publicCircle, publishStatus: "draft" };
    for (const viewerDid of [undefined, "did:outsider"]) {
        const scenario = dependencies({ circle: draft, viewerDid, canEdit: !viewerDid });
        assert.equal(await resolveCircleRouteAccess("draft", scenario), null);
        assert.deepEqual(await metadataFor(scenario), missingMetadata);
    }
    const creatorDraft = { ...draft, createdBy: "did:creator" };
    const creatorAccess = await resolveCircleRouteAccess("draft", dependencies({
        circle: creatorDraft, viewerDid: "did:creator",
    }));
    assert.equal(creatorAccess?.canEditAbout, false);
    const editorAccess = await resolveCircleRouteAccess("draft", dependencies({
        circle: draft, viewerDid: "did:editor", canEdit: true,
    }));
    assert.equal(editorAccess?.canEditAbout, true);

    for (const [circle, viewerDid, authorized, expected] of [
        [publicCircle, undefined, true, false],
        [publicCircle, "did:member", false, false],
        [publicCircle, "did:admin", true, true],
        [{ ...publicCircle, circleType: "user", did: "did:owner" }, "did:owner", true, true],
        [{ ...publicCircle, circleType: "user", did: "did:owner" }, "did:member", true, false],
    ] satisfies Array<[Circle, string | undefined, boolean, boolean]>) {
        const routeAccess = await resolveCircleRouteAccess("fixture", dependencies({
            circle, viewerDid, canEdit: authorized,
        }));
        assert.equal(routeAccess?.canEditAbout, expected);
    }

    console.log("circle route access and metadata tests passed");
}

void main();
