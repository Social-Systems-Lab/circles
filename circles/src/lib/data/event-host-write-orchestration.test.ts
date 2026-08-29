import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import type { Circle, Member } from "@/models/models";
import { parseEventHostCircleIds } from "./event-host-input";
import {
    EVENT_HOSTS_UNAVAILABLE,
    withWritableEventHostsForCreate,
    withWritableEventHostsForStageTransition,
    withWritableEventHostsForUpdate,
    type EventHostWriteDependencies,
} from "./event-host-write-policy";

const actorDid = "did:example:actor";
const publicId = new ObjectId();
const publicTwoId = new ObjectId();
const secretId = new ObjectId();
const secretTwoId = new ObjectId();
const pausedId = new ObjectId();
const suspendedId = new ObjectId();
const removedId = new ObjectId();

const circles = [
    { _id: publicId, circleType: "circle", visibility: "public", moderationStatus: "active" },
    { _id: publicTwoId, circleType: "circle", visibility: "public", moderationStatus: "active" },
    { _id: secretId, circleType: "circle", visibility: "secret", moderationStatus: "active" },
    { _id: secretTwoId, circleType: "circle", visibility: "secret", moderationStatus: "active" },
    { _id: pausedId, circleType: "circle", visibility: "public", moderationStatus: "paused" },
    { _id: suspendedId, circleType: "circle", visibility: "public", moderationStatus: "suspended" },
    { _id: removedId, circleType: "circle", visibility: "public", moderationStatus: "removed" },
] as Circle[];

const dependencies = (memberIds: string[] = []): EventHostWriteDependencies => ({
    getCircles: async (ids) => circles.filter((circle) => ids.includes(String(circle._id))),
    getCanonicalMember: async (did, circleId) =>
        memberIds.includes(circleId) ? ({ userDid: did, circleId } as Member) : null,
});

type HostInput = { circleId: string; hostCircleIds?: unknown };

type CreateEffects = {
    featureAuthorization: number;
    upload: number;
    eventInsert: number;
    shadowCreate: number;
    eventVector: number;
    derivedShadowVector: number;
    noticeboardPublish: number;
    notification: number;
};
const zeroCreateEffects = (): CreateEffects => ({
    featureAuthorization: 0,
    upload: 0,
    eventInsert: 0,
    shadowCreate: 0,
    eventVector: 0,
    derivedShadowVector: 0,
    noticeboardPublish: 0,
    notification: 0,
});

type UpdateEffects = {
    mediaUpload: number;
    mediaDelete: number;
    eventUpdate: number;
    shadowEffect: number;
    eventVector: number;
    derivedShadowVector: number;
    noticeboardEffect: number;
    notification: number;
};
const zeroUpdateEffects = (): UpdateEffects => ({
    mediaUpload: 0,
    mediaDelete: 0,
    eventUpdate: 0,
    shadowEffect: 0,
    eventVector: 0,
    derivedShadowVector: 0,
    noticeboardEffect: 0,
    notification: 0,
});

type StageEffects = {
    managementAuthorization: number;
    stageMutation: number;
    shadowPublication: number;
    eventVector: number;
    derivedShadowVector: number;
    noticeboard: number;
    notification: number;
};
const zeroStageEffects = (): StageEffects => ({
    managementAuthorization: 0,
    stageMutation: 0,
    shadowPublication: 0,
    eventVector: 0,
    derivedShadowVector: 0,
    noticeboard: 0,
    notification: 0,
});

async function assertCreateDenied(event: HostInput, deps: EventHostWriteDependencies = dependencies()) {
    const effects = zeroCreateEffects();
    await assert.rejects(
        () =>
            withWritableEventHostsForCreate(
                event,
                actorDid,
                async () => {
                    effects.featureAuthorization++;
                    effects.upload++;
                    effects.eventInsert++;
                    effects.shadowCreate++;
                    effects.eventVector++;
                    effects.derivedShadowVector++;
                    effects.noticeboardPublish++;
                    effects.notification++;
                },
                deps,
            ),
        { message: EVENT_HOSTS_UNAVAILABLE },
    );
    assert.deepEqual(effects, zeroCreateEffects());
}

async function assertUpdateDenied(event: HostInput, deps: EventHostWriteDependencies = dependencies()) {
    const effects = zeroUpdateEffects();
    await assert.rejects(
        () =>
            withWritableEventHostsForUpdate(
                event,
                actorDid,
                async () => {
                    effects.mediaUpload++;
                    effects.mediaDelete++;
                    effects.eventUpdate++;
                    effects.shadowEffect++;
                    effects.eventVector++;
                    effects.derivedShadowVector++;
                    effects.noticeboardEffect++;
                    effects.notification++;
                },
                deps,
            ),
        { message: EVENT_HOSTS_UNAVAILABLE },
    );
    assert.deepEqual(effects, zeroUpdateEffects());
}

async function assertStageDenied(event: HostInput, deps: EventHostWriteDependencies = dependencies()) {
    const effects = zeroStageEffects();
    await assert.rejects(
        () =>
            withWritableEventHostsForStageTransition(
                event,
                actorDid,
                async () => {
                    effects.managementAuthorization++;
                    effects.stageMutation++;
                    effects.shadowPublication++;
                    effects.eventVector++;
                    effects.derivedShadowVector++;
                    effects.noticeboard++;
                    effects.notification++;
                },
                deps,
            ),
        { message: EVENT_HOSTS_UNAVAILABLE },
    );
    assert.deepEqual(effects, zeroStageEffects());
}

async function main() {
    const mixed = { circleId: publicId.toHexString(), hostCircleIds: [secretId.toHexString()] };
    const membershipLoss = {
        circleId: secretId.toHexString(),
        hostCircleIds: [secretTwoId.toHexString()],
    };
    const malformed = { circleId: publicId.toHexString(), hostCircleIds: ["malformed"] };
    const lifecycleInvalid = [pausedId, suspendedId, removedId].map((id) => ({
        circleId: publicId.toHexString(),
        hostCircleIds: [id.toHexString()],
    }));

    const emptyElementForm = new FormData();
    emptyElementForm.append("hostCircleIds", JSON.stringify([publicTwoId.toHexString(), ""]));
    const emptyElement = {
        circleId: publicId.toHexString(),
        hostCircleIds: parseEventHostCircleIds(emptyElementForm, publicId.toHexString()),
    };

    // CREATE uses its production gate and only create-specific continuation effects.
    for (const input of [mixed, membershipLoss, malformed, emptyElement, ...lifecycleInvalid]) {
        await assertCreateDenied(input);
    }
    const createEffects = zeroCreateEffects();
    const createOrder: string[] = [];
    const createDependencies = dependencies();
    const getCreateCircles = createDependencies.getCircles;
    createDependencies.getCircles = async (ids) => {
        createOrder.push("host-policy");
        return getCreateCircles(ids);
    };
    await withWritableEventHostsForCreate(
        { circleId: publicId.toHexString(), hostCircleIds: [publicTwoId.toHexString()] },
        actorDid,
        async () => {
            createOrder.push("feature-authorization");
            createEffects.featureAuthorization++;
            createOrder.push("create-continuation");
            createEffects.eventInsert++;
        },
        createDependencies,
    );
    assert.deepEqual(createOrder, ["host-policy", "feature-authorization", "create-continuation"]);
    assert.equal(createEffects.featureAuthorization, 1);
    assert.equal(createEffects.eventInsert, 1);

    // UPDATE uses its production gate and only update-specific continuation effects.
    for (const input of [mixed, membershipLoss, malformed, emptyElement, ...lifecycleInvalid]) {
        await assertUpdateDenied(input);
    }
    const updateEffects = zeroUpdateEffects();
    await withWritableEventHostsForUpdate(
        { circleId: publicId.toHexString(), hostCircleIds: [publicTwoId.toHexString()] },
        actorDid,
        async () => {
            updateEffects.eventUpdate++;
        },
        dependencies(),
    );
    assert.equal(updateEffects.eventUpdate, 1, "the update continuation runs once after host approval");

    // STAGE uses its production gate and exposes explicit management and stage-mutation counters.
    for (const input of [mixed, membershipLoss, malformed, emptyElement, ...lifecycleInvalid]) {
        await assertStageDenied(input);
    }
    const stageEffects = zeroStageEffects();
    await withWritableEventHostsForStageTransition(
        { circleId: publicId.toHexString(), hostCircleIds: [publicTwoId.toHexString()] },
        actorDid,
        async () => {
            stageEffects.managementAuthorization++;
            stageEffects.stageMutation++;
        },
        dependencies(),
    );
    assert.deepEqual(
        { managementAuthorization: stageEffects.managementAuthorization, stageMutation: stageEffects.stageMutation },
        { managementAuthorization: 1, stageMutation: 1 },
        "the stage continuation runs once after host approval",
    );

    const binaryHostInput = new FormData();
    binaryHostInput.append("hostCircleIds", new Blob(["not a host id"]), "host.bin");
    const parsedBinaryHostInput = parseEventHostCircleIds(binaryHostInput, publicId.toHexString());
    assert.deepEqual(parsedBinaryHostInput, [publicId.toHexString(), "__invalid_event_host_structure__"]);
    await assertCreateDenied({ circleId: publicId.toHexString(), hostCircleIds: parsedBinaryHostInput });

    const malformedJson = new FormData();
    malformedJson.append("hostCircleIds", JSON.stringify([publicTwoId.toHexString(), 42]));
    await assertCreateDenied({
        circleId: publicId.toHexString(),
        hostCircleIds: parseEventHostCircleIds(malformedJson, publicId.toHexString()),
    });

    console.log("event host write orchestration behavioral tests passed");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
