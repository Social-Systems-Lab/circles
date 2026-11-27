import assert from "node:assert/strict";
// @ts-expect-error Bun provides its test APIs at runtime.
import { mock, test } from "bun:test";
import { ObjectId } from "mongodb";
import type { Circle } from "@/models/models";
import { features, getDefaultAccessRules } from "@/lib/data/constants";

const circleId = new ObjectId();
const ownerId = new ObjectId();
const ownerDid = "did:fixture:owner";
const adminDid = "did:fixture:admin";
const memberDid = "did:fixture:member";
const outsiderDid = "did:fixture:outsider";
const circle = {
    _id: circleId,
    circleType: "circle" as const,
    handle: "fixture",
    publishStatus: "published" as const,
    accessRules: getDefaultAccessRules(),
};
const owner = { _id: ownerId, did: ownerDid, handle: "owner", circleType: "user", accessRules: getDefaultAccessRules() };
const readyProfiles = [adminDid, memberDid, outsiderDid].map((did) => ({
    _id: new ObjectId(),
    did,
    circleType: "user",
    isEmailVerified: true,
    description: "Fixture introduction",
    communityGuidelinesAcceptance: Object.fromEntries(
        ["truth", "constructive", "respect", "privacy", "responsibility"].map((rule) => [
            rule,
            { accepted: true, acceptedAt: new Date() },
        ]),
    ),
}));

let viewerDid: string | undefined;
let target: Omit<Circle, "_id"> & { _id: ObjectId } = circle;
const writes: Array<{ update: Partial<Circle>; actor: string }> = [];
const revalidatedPaths: string[] = [];
const db = await import("@/lib/data/db");
mock.module("@/lib/data/db", () => ({
    ...db,
    Circles: {
        findOne: async ({ _id, did }: { _id?: ObjectId; did?: string }) =>
            did
                ? [owner, ...readyProfiles].find((profile) => profile.did === did)
                : _id?.equals(circleId)
                  ? target
                  : _id?.equals(ownerId)
                    ? owner
                    : null,
    },
    Members: {
        findOne: async ({ userDid, circleId: id }: { userDid: string; circleId: string }) => {
            const group =
                id === circleId.toString()
                    ? userDid === adminDid
                        ? "admins"
                        : userDid === memberDid
                          ? "members"
                          : undefined
                    : id === ownerId.toString() && userDid === ownerDid
                      ? "admins"
                      : undefined;
            return group ? { userDid, circleId: id, userGroups: [group] } : null;
        },
    },
}));
const auth = await import("@/lib/auth/auth");
mock.module("@/lib/auth/auth", () => ({ ...auth, getAuthenticatedUserDid: async () => viewerDid }));
const circleData = await import("@/lib/data/circle");
mock.module("@/lib/data/circle", () => ({
    ...circleData,
    updateCircle: async (update: Partial<Circle>, actor: string) => {
        writes.push({ update, actor });
    },
}));
mock.module("next/cache", () => ({
    revalidatePath: (path: string) => {
        revalidatedPaths.push(path);
    },
}));
const { savePresence } = await import("./actions");

const values: Circle = {
    _id: circleId.toString(),
    handle: "fixture",
    did: "did:fixture:ignored",
    offers: { text: "Public fixture offer", visibility: "public" },
};

test("presence saves require an authenticated editor and preserve the DID", async () => {
    for (const actor of [undefined, outsiderDid, memberDid]) {
        viewerDid = actor;
        assert.equal((await savePresence(values)).success, false);
    }
    assert.deepEqual(writes, []);
    assert.deepEqual(revalidatedPaths, []);

    viewerDid = adminDid;
    assert.equal((await savePresence(values)).success, true);
    viewerDid = ownerDid;
    assert.equal((await savePresence({ ...values, _id: ownerId.toString(), handle: "owner" })).success, true);
    assert.deepEqual(
        writes.map(({ actor }) => actor),
        [adminDid, ownerDid],
    );
    assert.ok(writes.every(({ update }) => !Object.hasOwn(update, "did")));
});

test("presence authorisation never treats a missing account or a Secret Circle outsider as an editor", async () => {
    target = {
        ...circle,
        accessRules: { settings: { edit_about: ["everyone"] } },
    };
    assert.equal(await auth.isAuthorized(undefined, circleId.toString(), features.settings.edit_about), false);
    assert.equal(
        await auth.isAuthorized("did:fixture:missing-account", circleId.toString(), features.settings.edit_about),
        false,
    );
    target = { ...target, visibility: "secret" };
    writes.length = 0;
    viewerDid = outsiderDid;
    assert.equal((await savePresence(values)).success, false);
    assert.deepEqual(writes, []);
    viewerDid = memberDid;
    assert.equal((await savePresence(values)).success, true);
    assert.deepEqual(
        writes.map(({ actor }) => actor),
        [memberDid],
    );
});


test("a delegated editor can save presence without a stored View Settings rule", async () => {
    target = { ...circle, accessRules: { settings: { edit_about: ["members"] } } };
    viewerDid = memberDid;
    writes.length = 0;
    revalidatedPaths.length = 0;

    assert.equal(await auth.isAuthorized(memberDid, circleId.toString(), features.settings.view), false);
    assert.equal((await savePresence(values)).success, true);
    assert.equal(writes.length, 1);
    assert.equal(writes[0].actor, memberDid);
    assert.deepEqual(writes[0].update.offers, values.offers);
    assert.ok(revalidatedPaths.includes("/circles/fixture/settings/presence"));
    writes.length = 0;
    target = { ...target, accessRules: { settings: { edit_about: ["members"], view: [] } } };
    assert.equal((await savePresence(values)).success, false);
    target = { ...circle, publishStatus: "draft", accessRules: { settings: { edit_about: ["members"] } } };
    assert.equal((await savePresence(values)).success, false);
    assert.deepEqual(writes, []);
});
