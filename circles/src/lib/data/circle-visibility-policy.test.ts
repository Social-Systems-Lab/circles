import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import type { Circle, Member } from "@/models/models";
import {
    assertGenericCircleUpdateDoesNotChangeVisibility,
    canDiscoverCircle,
    canReadCircle,
    canSetCircleVisibility,
    circleVisibilityMongoQuery,
    evaluateCircleVisibilityAccess,
    getCircleVisibility,
} from "./circle-visibility-policy";

const circleId = new ObjectId();
const otherCircleId = new ObjectId();
const member: Member = {
    userDid: "did:member",
    circleId: circleId.toString(),
    userGroups: ["members"],
    joinedAt: new Date(),
};
const membershipDependencies = (canonicalMember: Member | null) => ({
    getMember: async () => canonicalMember,
});
const circle = (overrides: Partial<Circle> = {}): Circle => ({
    _id: circleId,
    circleType: "circle",
    ...overrides,
});

assert.equal(getCircleVisibility({}), "public");
assert.equal(getCircleVisibility({ visibility: "public" }), "public");
assert.equal(getCircleVisibility({ visibility: "secret" }), "secret");
assert.equal(getCircleVisibility({ circleType: "user", visibility: "secret" }), "public");
assert.deepEqual(evaluateCircleVisibilityAccess({ circle: null, isMember: false }), {
    canDiscover: false,
    canRead: false,
});
assert.deepEqual(evaluateCircleVisibilityAccess({ circle: undefined, isMember: false }), {
    canDiscover: false,
    canRead: false,
});

for (const input of [
    { viewerDid: undefined, isMember: false },
    { viewerDid: "did:outsider", isMember: false },
    { viewerDid: "did:member", isMember: true },
]) {
    assert.deepEqual(evaluateCircleVisibilityAccess({ circle: circle(), ...input }), {
        canDiscover: true,
        canRead: true,
    });
}

assert.deepEqual(
    evaluateCircleVisibilityAccess({ circle: circle({ visibility: "secret" }), viewerDid: undefined, isMember: false }),
    { canDiscover: false, canRead: false },
);
assert.deepEqual(
    evaluateCircleVisibilityAccess({
        circle: circle({ visibility: "secret", createdBy: "did:creator" }),
        viewerDid: "did:creator",
        isMember: false,
    }),
    { canDiscover: false, canRead: false },
    "creator status is not membership",
);
assert.deepEqual(
    evaluateCircleVisibilityAccess({ circle: circle({ visibility: "secret" }), viewerDid: "did:admin", isMember: false }),
    { canDiscover: false, canRead: false },
    "superadmin identity alone is not a visibility bypass",
);

const run = async () => {
    const secretCircle = circle({ visibility: "secret" });
    assert.equal(await canReadCircle(undefined, secretCircle, membershipDependencies(null)), false);
    assert.equal(await canReadCircle("did:outsider", secretCircle, membershipDependencies(null)), false);
    assert.equal(await canDiscoverCircle("did:outsider", secretCircle, membershipDependencies(null)), false);
    assert.equal(await canReadCircle("did:member", secretCircle, membershipDependencies(member)), true);
    assert.equal(await canDiscoverCircle("did:member", secretCircle, membershipDependencies(member)), true);
    assert.equal(
        await canReadCircle(
            "did:member",
            secretCircle,
            membershipDependencies({ ...member, circleId: otherCircleId.toString() }),
        ),
        false,
        "a membership for another circle cannot grant access",
    );
    assert.equal(
        await canReadCircle("did:group-only", secretCircle, membershipDependencies(null)),
        false,
        "groups without a canonical Members row do not grant access",
    );
    assert.equal(
        await canReadCircle("did:member", circle({ _id: "malformed", visibility: "secret" }), membershipDependencies(member)),
        false,
        "malformed circle IDs fail closed before membership lookup",
    );

    for (const moderationStatus of ["active", "paused"] as const) {
        assert.equal(
            await canReadCircle("did:member", secretCircleWithStatus(moderationStatus), membershipDependencies(member)),
            true,
        );
    }
    for (const moderationStatus of ["suspended", "removed"] as const) {
        assert.equal(
            await canReadCircle("did:member", secretCircleWithStatus(moderationStatus), membershipDependencies(member)),
            false,
        );
    }

    const denyAdmin = { isSuperAdminDid: async () => false };
    const allowAdmin = { isSuperAdminDid: async () => true };
    assert.equal(await canSetCircleVisibility({ actorDid: "did:user", circleType: "circle" }, denyAdmin), true);
    assert.equal(
        await canSetCircleVisibility(
            { actorDid: "did:user", circleType: "circle", visibility: "public" },
            denyAdmin,
        ),
        true,
    );
    assert.equal(
        await canSetCircleVisibility(
            { actorDid: "did:claimed-admin", circleType: "circle", visibility: "secret" },
            denyAdmin,
        ),
        false,
        "a supplied DID is not sufficient without authoritative superadmin lookup",
    );
    assert.equal(
        await canSetCircleVisibility(
            { actorDid: "did:admin", circleType: "circle", visibility: "secret" },
            allowAdmin,
        ),
        true,
    );
    assert.equal(
        await canSetCircleVisibility(
            { actorDid: "did:admin", circleType: "project", visibility: "secret" },
            allowAdmin,
        ),
        true,
    );
    assert.equal(
        await canSetCircleVisibility(
            { actorDid: "did:admin", circleType: "user", visibility: "secret" },
            allowAdmin,
        ),
        false,
    );
    for (const invalidVisibility of [null, "private", 1]) {
        assert.equal(
            await canSetCircleVisibility(
                { actorDid: "did:admin", circleType: "circle", visibility: invalidVisibility },
                allowAdmin,
            ),
            false,
            `runtime-invalid visibility ${String(invalidVisibility)} is rejected even for a superadmin`,
        );
    }

    assert.doesNotThrow(() => assertGenericCircleUpdateDoesNotChangeVisibility(circle(), {}));
    assert.doesNotThrow(() =>
        assertGenericCircleUpdateDoesNotChangeVisibility(circle(), { visibility: "public" }),
    );
    assert.throws(
        () => assertGenericCircleUpdateDoesNotChangeVisibility(circle(), { visibility: "secret" }),
        /dedicated platform authorization path/,
    );

    console.log("circle visibility policy tests passed");
};

const secretCircleWithStatus = (moderationStatus: "active" | "paused" | "suspended" | "removed") =>
    circle({ visibility: "secret", moderationStatus });

const anonymousQuery = circleVisibilityMongoQuery({});
assert.deepEqual(anonymousQuery, {
    $or: [{ circleType: "user" }, { visibility: { $exists: false } }, { visibility: "public" }],
});

const authenticatedQuery = circleVisibilityMongoQuery({
    viewerDid: "did:member",
    memberCircleIds: [circleId.toString(), "malformed", otherCircleId.toString()],
});
const authenticatedConditions = authenticatedQuery.$or as Record<string, unknown>[];
assert.deepEqual(authenticatedConditions.slice(0, 3), [
    { circleType: "user" },
    { visibility: { $exists: false } },
    { visibility: "public" },
]);
const secretCondition = authenticatedConditions[3] as {
    visibility: string;
    _id: { $in: ObjectId[] };
};
assert.equal(secretCondition.visibility, "secret");
assert.deepEqual(
    secretCondition._id.$in.map((id) => id.toString()),
    [circleId.toString(), otherCircleId.toString()],
    "only valid trusted member circle IDs are included",
);
assert.deepEqual(
    circleVisibilityMongoQuery({ memberCircleIds: [circleId.toString()] }),
    anonymousQuery,
    "member IDs cannot grant access without an authenticated viewer",
);

void run();
