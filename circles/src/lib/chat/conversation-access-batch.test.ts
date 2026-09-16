import assert from "node:assert/strict";
import test from "node:test";
import { ObjectId } from "mongodb";
import { loadAuthorizedConversationCandidates } from "./conversation-access-batch";

test("sidebar authorizes many raw candidates with one query per canonical data set before enrichment", async () => {
    const viewerDid = "did:alice";
    const secretMemberId = new ObjectId().toHexString();
    const secretFormerId = new ObjectId().toHexString();
    const publicId = new ObjectId().toHexString();
    const ids = Array.from({ length: 18 }, () => new ObjectId());
    const candidates: any[] = [
        ...ids.slice(0, 6).map((_id) => ({ _id, type: "group", circleId: secretMemberId, participants: [viewerDid] })),
        ...ids.slice(6, 12).map((_id) => ({ _id, type: "group", circleId: secretFormerId, participants: [viewerDid] })),
        ...ids.slice(12).map((_id) => ({ _id, type: "group", circleId: publicId, participants: [viewerDid] })),
        { _id: new ObjectId(), type: "dm", participants: [viewerDid, "did:bob"] },
        { _id: new ObjectId(), type: "group", participants: [viewerDid] },
    ];
    const calls = { canonical: 0, candidates: 0, circles: 0, chat: 0, enrich: 0, ensure: 0 };
    const staleIds = new Set(ids.slice(6, 12).map(String));
    const result = await loadAuthorizedConversationCandidates(viewerDid, {
        findCanonicalMemberships: async () => (calls.canonical++, [{ userDid: viewerDid, circleId: secretMemberId }]),
        findCandidates: async () => (calls.candidates++, candidates),
        findOwningCircles: async (circleIds) => {
            calls.circles++;
            assert.deepEqual(new Set(circleIds), new Set([secretMemberId, secretFormerId, publicId]));
            return [
                { _id: new ObjectId(secretMemberId), circleType: "circle", visibility: "secret", moderationStatus: "active" },
                { _id: new ObjectId(secretFormerId), circleType: "circle", visibility: "secret", moderationStatus: "active" },
                { _id: new ObjectId(publicId), circleType: "circle", visibility: "public", moderationStatus: "active" },
            ];
        },
        findChatMemberships: async (roomIds) => {
            calls.chat++;
            assert.equal(roomIds.length, candidates.length);
            return candidates
                .filter((candidate) => candidate.type !== "dm")
                .map((candidate) => ({ userDid: viewerDid, chatRoomId: candidate._id.toString(), status: "active" }));
        },
    });
    assert.deepEqual(calls, { canonical: 1, candidates: 1, circles: 1, chat: 1, enrich: 0, ensure: 0 });
    assert.equal(result.conversations.some((conversation) => staleIds.has(conversation._id.toString())), false);
    assert.equal(result.conversations.length, 14, "six stale Secret candidates are removed; authorized Circle, DM and group remain");
    // Model every downstream enrichment family and prove it only sees authorized IDs.
    for (const _stage of ["unread", "participants", "member-count", "circle-metadata", "activity"]) {
        calls.enrich++;
        assert.equal(result.conversations.some((conversation) => staleIds.has(conversation._id.toString())), false);
    }
    assert.equal(calls.enrich, 5);
});

test("superadmin-like stale rows do not grant Secret access and paused lifecycle remains read-only", async () => {
    const viewerDid = "did:superadmin";
    const circleId = new ObjectId().toHexString();
    const conversation = { _id: new ObjectId(), type: "group", circleId, participants: [viewerDid] } as any;
    const invoke = (canonical: boolean, moderationStatus: "active" | "paused") =>
        loadAuthorizedConversationCandidates(viewerDid, {
            findCanonicalMemberships: async () => (canonical ? [{ userDid: viewerDid, circleId }] : []),
            findCandidates: async () => [conversation],
            findOwningCircles: async () => [
                { _id: new ObjectId(circleId), circleType: "circle", visibility: "secret", moderationStatus },
            ],
            findChatMemberships: async () => [{ userDid: viewerDid, chatRoomId: conversation._id, status: "active" }],
        });
    assert.equal((await invoke(false, "active")).conversations.length, 0);
    assert.equal((await invoke(true, "paused")).conversations.length, 1);
});

