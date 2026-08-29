import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import type { Circle, Member } from "@/models/models";
import {
    EVENT_HOSTS_UNAVAILABLE,
    resolveWritableEventHosts,
    type EventHostWriteDependencies,
} from "./event-host-write-policy";
import { parseEventHostCircleIds } from "./event-host-input";

const actorDid = "did:example:actor";
const publicId = new ObjectId();
const missingVisibilityId = new ObjectId();
const secretOneId = new ObjectId();
const secretTwoId = new ObjectId();
const pausedId = new ObjectId();

const circles = [
    { _id: publicId, circleType: "circle", visibility: "public", moderationStatus: "active" },
    { _id: missingVisibilityId, circleType: "circle", moderationStatus: "active" },
    { _id: secretOneId, circleType: "circle", visibility: "secret", moderationStatus: "active" },
    { _id: secretTwoId, circleType: "circle", visibility: "secret", moderationStatus: "active" },
    { _id: pausedId, circleType: "circle", visibility: "public", moderationStatus: "paused" },
] as Circle[];

const dependencies = (memberIds: string[] = []): EventHostWriteDependencies => ({
    getCircles: async (ids) => circles.filter((circle) => ids.includes(String(circle._id))),
    getCanonicalMember: async (did, circleId) =>
        memberIds.includes(circleId) ? ({ userDid: did, circleId } as Member) : null,
});

const event = (circleId: ObjectId, hostCircleIds?: unknown) => ({
    circleId: circleId.toHexString(),
    hostCircleIds,
});

const denied = async (input: ReturnType<typeof event>, deps = dependencies()) => {
    await assert.rejects(() => resolveWritableEventHosts(input, actorDid, deps), {
        message: EVENT_HOSTS_UNAVAILABLE,
    });
};

async function main() {
    assert.deepEqual(
        (
            await resolveWritableEventHosts(
                event(publicId, [missingVisibilityId.toHexString()]),
                actorDid,
                dependencies(),
            )
        ).hostCircleIds,
        [publicId.toHexString(), missingVisibilityId.toHexString()],
        "public plus missing visibility is canonical public/public",
    );
    assert.equal(
        (
            await resolveWritableEventHosts(
                event(secretOneId, [secretTwoId.toHexString()]),
                actorDid,
                dependencies([secretOneId.toHexString(), secretTwoId.toHexString()]),
            )
        ).visibility,
        "secret",
        "two Secret hosts succeed only with canonical membership in both",
    );
    await denied(event(publicId, [secretOneId.toHexString()]));
    await denied(event(missingVisibilityId, [secretOneId.toHexString()]));
    await denied(event(secretOneId, [secretTwoId.toHexString()]), dependencies([secretOneId.toHexString()]));
    await denied(event(secretOneId, [secretTwoId.toHexString()]));
    await denied(event(pausedId));

    const duplicate = await resolveWritableEventHosts(
        event(publicId, [publicId.toHexString(), missingVisibilityId.toHexString(), publicId.toHexString()]),
        actorDid,
        dependencies(),
    );
    assert.deepEqual(
        duplicate.hostCircleIds,
        [publicId.toHexString(), missingVisibilityId.toHexString()],
        "primary and repeated hosts are canonically deduplicated",
    );
    assert.deepEqual(
        (await resolveWritableEventHosts(event(publicId), actorDid, dependencies())).hostCircleIds,
        [publicId.toHexString()],
        "missing hostCircleIds preserves primary-only semantics",
    );
    assert.deepEqual(
        (await resolveWritableEventHosts(event(publicId, null), actorDid, dependencies())).hostCircleIds,
        [publicId.toHexString()],
        "null hostCircleIds preserves primary-only legacy semantics",
    );
    await denied(event(publicId, "not-an-array"));
    await denied(event(publicId, ["not-an-object-id"]));
    await denied(event(publicId, [missingVisibilityId.toHexString(), 42]));
    await denied({ circleId: "not-an-object-id", hostCircleIds: [] });
    await denied(event(publicId, [new ObjectId().toHexString()]));

    for (const hostCircleIds of [
        [""],
        ["   "],
        [missingVisibilityId.toHexString(), ""],
        [" ", missingVisibilityId.toHexString()],
    ]) {
        const formData = new FormData();
        formData.append("hostCircleIds", JSON.stringify(hostCircleIds));
        await denied({
            circleId: publicId.toHexString(),
            hostCircleIds: parseEventHostCircleIds(formData, publicId.toHexString()),
        });
    }

    const missingFormData = new FormData();
    assert.deepEqual(parseEventHostCircleIds(missingFormData, publicId.toHexString()), [publicId.toHexString()]);
    const emptyFormData = new FormData();
    emptyFormData.append("hostCircleIds", "");
    assert.deepEqual(parseEventHostCircleIds(emptyFormData, publicId.toHexString()), [publicId.toHexString()]);
    const emptyArrayFormData = new FormData();
    emptyArrayFormData.append("hostCircleIds", "[]");
    assert.deepEqual(parseEventHostCircleIds(emptyArrayFormData, publicId.toHexString()), [publicId.toHexString()]);

    console.log("event host write policy tests passed");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
