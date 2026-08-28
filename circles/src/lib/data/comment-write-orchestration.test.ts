import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import type { CircleMentionWriteResult } from "./circle-mention-write-policy";
import {
    COMMENT_TARGET_UNAVAILABLE,
    orchestrateAuthoredCommentCreate,
    orchestrateAuthoredCommentEdit,
} from "./comment-write-policy";

const postId = new ObjectId().toString();
const otherPostId = new ObjectId().toString();
const parentId = new ObjectId().toString();
const mentionId = new ObjectId().toString();

const allowed = async (content: string): Promise<CircleMentionWriteResult> => ({
    ok: true,
    content: content.replace("forged", "Canonical"),
    mentions: content.includes("mention") ? [{ type: "circle", id: mentionId }] : [],
});

async function create(input: {
    parentCommentId?: string | null;
    parentPostId?: string | null;
    canonicalize?: typeof allowed;
}) {
    const order: string[] = [];
    let inserts = 0;
    let increments = 0;
    let notifications = 0;
    const result = await orchestrateAuthoredCommentCreate({
        postId,
        parentCommentId: input.parentCommentId,
        content: "mention forged",
        writerDid: "did:writer",
        dependencies: {
            canonicalize: input.canonicalize ?? allowed,
            findParentComment: async () => {
                order.push("parent");
                return input.parentPostId === null ? null : { postId: input.parentPostId ?? postId };
            },
            insert: async (prepared, targetPostId) => {
                order.push("insert");
                inserts += 1;
                return { ...prepared, postId: targetPostId };
            },
            incrementParentReplies: async () => {
                order.push("increment");
                increments += 1;
            },
            notify: async () => {
                order.push("notify");
                notifications += 1;
            },
        },
    });
    return { result, order, inserts, increments, notifications };
}

async function testSuccessAndOrdering() {
    const root = await create({});
    assert.deepEqual(root.order, ["insert", "notify"]);
    assert.deepEqual([root.inserts, root.increments, root.notifications], [1, 0, 1]);
    assert.equal(root.result.inserted.postId, postId);
    assert.equal(root.result.prepared.content, "mention Canonical");
    assert.deepEqual(root.result.prepared.mentions, [{ type: "circle", id: mentionId }]);

    const reply = await create({ parentCommentId: parentId });
    assert.deepEqual(reply.order, ["parent", "insert", "increment", "notify"]);
    assert.deepEqual([reply.inserts, reply.increments, reply.notifications], [1, 1, 1]);
    assert.equal(reply.result.inserted.postId, postId);
}

async function testParentDenials() {
    for (const fixture of [
        { parentCommentId: parentId, parentPostId: otherPostId },
        { parentCommentId: parentId, parentPostId: null },
        { parentCommentId: "malformed", parentPostId: postId },
    ]) {
        let inserts = 0;
        let increments = 0;
        let notifications = 0;
        await assert.rejects(orchestrateAuthoredCommentCreate({
            postId,
            parentCommentId: fixture.parentCommentId,
            content: "plain",
            writerDid: "did:writer",
            dependencies: {
                canonicalize: allowed,
                findParentComment: async () => fixture.parentPostId === null ? null : { postId: fixture.parentPostId },
                insert: async () => (inserts += 1),
                incrementParentReplies: async () => { increments += 1; },
                notify: async () => { notifications += 1; },
            },
        }), (error: unknown) => error instanceof Error && error.message === COMMENT_TARGET_UNAVAILABLE);
        assert.deepEqual([inserts, increments, notifications], [0, 0, 0]);
    }
}

async function testCanonicalTargetAndInsertFailure() {
    const callerPostId = postId.toUpperCase();
    const canonicalPostId = new ObjectId(callerPostId).toString();
    let validatedAgainst = "";
    let persistedPostId = "";
    await orchestrateAuthoredCommentCreate({
        postId: canonicalPostId,
        parentCommentId: parentId,
        content: "plain",
        writerDid: "did:writer",
        dependencies: {
            canonicalize: allowed,
            findParentComment: async () => {
                validatedAgainst = canonicalPostId;
                return { postId: canonicalPostId };
            },
            insert: async (prepared, targetPostId) => {
                persistedPostId = targetPostId;
                return { ...prepared, postId: targetPostId };
            },
            incrementParentReplies: async () => undefined,
            notify: async () => undefined,
        },
    });
    assert.notEqual(callerPostId, canonicalPostId);
    assert.equal(validatedAgainst, canonicalPostId);
    assert.equal(persistedPostId, canonicalPostId);

    let increments = 0;
    let notifications = 0;
    await assert.rejects(orchestrateAuthoredCommentCreate({
        postId,
        parentCommentId: parentId,
        content: "plain",
        writerDid: "did:writer",
        dependencies: {
            canonicalize: allowed,
            findParentComment: async () => ({ postId }),
            insert: async () => { throw new Error("insert failed"); },
            incrementParentReplies: async () => { increments += 1; },
            notify: async () => { notifications += 1; },
        },
    }), /insert failed/);
    assert.deepEqual([increments, notifications], [0, 0]);
}

async function testMentionAndEditDenialsHaveNoSideEffects() {
    const denied = async (): Promise<CircleMentionWriteResult> => ({
        ok: false,
        error: "One or more references are unavailable.",
    });
    let inserts = 0;
    let increments = 0;
    let notifications = 0;
    await assert.rejects(
        orchestrateAuthoredCommentCreate({
            postId,
            parentCommentId: parentId,
            content: "secret mention",
            writerDid: "did:outsider",
            dependencies: {
                canonicalize: denied,
                findParentComment: async () => ({ postId }),
                insert: async () => (inserts += 1),
                incrementParentReplies: async () => {
                    increments += 1;
                },
                notify: async () => {
                    notifications += 1;
                },
            },
        }),
        /One or more references are unavailable/,
    );
    assert.deepEqual([inserts, increments, notifications], [0, 0, 0]);

    let updates = 0;
    await assert.rejects(
        orchestrateAuthoredCommentEdit({
            postId,
            content: "retained secret reference",
            writerDid: "did:former-member",
            dependencies: {
                canonicalize: denied,
                update: async () => (updates += 1),
                notify: async () => {
                    notifications += 1;
                },
            },
        }),
        /One or more references are unavailable/,
    );
    assert.equal(updates, 0);
    assert.equal(notifications, 0);
}

async function main() {
    await testSuccessAndOrdering();
    await testParentDenials();
    await testCanonicalTargetAndInsertFailure();
    await testMentionAndEditDenialsHaveNoSideEffects();
    console.log("Comment write orchestration tests passed");
}

main();
