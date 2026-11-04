import assert from "node:assert/strict";
// @ts-expect-error Bun's runtime test module is available even though this repository does not install its types.
import { mock, test } from "bun:test";
import { ObjectId } from "mongodb";

const circleId = new ObjectId().toString();
const userDid = "did:recipient";
const members = [
    { _id: new ObjectId(), userDid: "did:owner", circleId },
    { _id: new ObjectId(), userDid, circleId },
];
const chatMembers = new Set<string>();
let storedCount = 99;

mock.module("./db", () => ({
    Members: {
        findOne: async ({ userDid: did, circleId: id }: Record<string, string>) =>
            members.find((member) => member.userDid === did && member.circleId === id) ?? null,
        countDocuments: async ({ circleId: id }: Record<string, string>) =>
            members.filter((member) => member.circleId === id).length,
        insertOne: async (member: Record<string, unknown>) => {
            members.push({ ...member, _id: new ObjectId() } as (typeof members)[number]);
        },
    },
    Circles: {
        findOne: async () => ({ _id: new ObjectId(circleId), circleType: "circle" }),
        updateOne: async (_filter: unknown, update: { $set?: { members?: number }; $inc?: { members?: number } }) => {
            if (update.$set?.members !== undefined) storedCount = update.$set.members;
            if (update.$inc?.members !== undefined) storedCount += update.$inc.members;
            return { matchedCount: 1 };
        },
    },
    ChatRoomMembers: {},
}));
mock.module("./chat", () => ({
    getChatRoomByHandle: async () => ({ _id: "members-chat" }),
    addChatRoomMember: async (did: string, chatRoomId: string) => {
        chatMembers.add(`${did}:${chatRoomId}`);
    },
    removeChatRoomMember: async () => undefined,
}));
mock.module("./member", () => ({ addMember: async () => undefined }));

const { reconcileSecretInvitationMembership } = await import("./secret-invitation-membership");

test("Secret invitation reconciliation idempotently repairs members chat and exact canonical count", async () => {
    await reconcileSecretInvitationMembership(userDid, circleId);
    await reconcileSecretInvitationMembership(userDid, circleId);

    assert.equal(chatMembers.size, 1);
    assert.equal(storedCount, members.filter((member) => member.circleId === circleId).length);
    assert.equal(members.filter((member) => member.userDid === userDid && member.circleId === circleId).length, 1);
});
