import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import type { Circle, Feed, Member, Post } from "@/models/models";
import { resolveReadablePostContext } from "./post-access-policy";
import { canReadPostSource, type PostSourceType } from "./post-source-access-policy";
import { canReadCircle } from "./circle-visibility-policy";
import { ORIGINAL_POST_UNAVAILABLE, resolveSharedOriginalForWrite } from "./shared-original-write-policy";

const writerDid = "did:writer";
const outsiderDid = "did:outsider";
const superadmin = { did: "did:superadmin", isSuperadmin: true };

function fixture(input: {
    visibility?: "public" | "secret";
    moderationStatus?: Circle["moderationStatus"];
    memberDid?: string;
    sourceType?: PostSourceType;
    sourceReadable?: boolean;
}) {
    const postId = new ObjectId();
    const feedId = new ObjectId();
    const circleId = new ObjectId();
    const sourceId = new ObjectId();
    const sourceCircleId = new ObjectId();
    const circle = {
        _id: circleId,
        circleType: "circle",
        visibility: input.visibility ?? "public",
        moderationStatus: input.moderationStatus ?? "active",
        enabledModules: ["feed"],
        name: "Owner",
        handle: "owner",
    } as Circle;
    const sourceCircle = {
        _id: sourceCircleId,
        circleType: "circle",
        visibility: input.sourceReadable === false ? "secret" : "public",
        moderationStatus: "active",
        name: "Source owner",
        handle: "source-owner",
    } as Circle;
    const feed = { _id: feedId, circleId: circleId.toHexString(), handle: "default" } as Feed;
    const sourceType = input.sourceType;
    const post = {
        _id: postId,
        feedId: feedId.toHexString(),
        createdBy: "did:author",
        createdAt: new Date(),
        content: "Original",
        reactions: {},
        comments: 0,
        userGroups: ["everyone"],
        ...(sourceType === "funding"
            ? { sourceResourceType: "funding" as const, sourceResourceId: sourceId.toHexString() }
            : sourceType
              ? { parentItemType: sourceType, parentItemId: sourceId.toHexString(), postType: sourceType }
              : {}),
    } as Post;
    const source = {
        _id: sourceId,
        circleId: sourceCircleId.toHexString(),
        ...(sourceType === "event" ? { hostCircleIds: [] } : {}),
    };
    let reads = 0;
    const resolvePreview = async (candidate: string, viewerDid?: string) => {
        reads += 1;
        const context = await resolveReadablePostContext(candidate, viewerDid, {
            findPost: async (id) => (id.equals(postId) ? post : null),
            findFeed: async (id) => (id.equals(feedId) ? feed : null),
            findCircle: async (id) => (id.equals(circleId) ? circle : null),
            findMember: async (did, id) =>
                did === input.memberDid && id === circleId.toHexString()
                    ? ({ userDid: did, circleId: id } as Member)
                    : null,
            findAuthor: async () => ({ did: "did:author", isVerified: true } as Circle),
            authorizeFeature: async () => true,
            canReadSource: (candidatePost, did) =>
                canReadPostSource(candidatePost, did, {
                    findSource: async (type, id) => (type === sourceType && id.equals(sourceId) ? (source as never) : null),
                    findCircles: async (ids) =>
                        ids.some((id) => id.equals(sourceCircleId)) ? [sourceCircle] : [],
                    canReadOwner: (viewer, owner) =>
                        canReadCircle(viewer, owner, {
                            getMember: async (did, id) =>
                                did === writerDid && input.sourceReadable !== false
                                    ? ({ userDid: did, circleId: id } as Member)
                                    : null,
                        }),
                }),
        });
        return context
            ? { content: context.post.content, author: { name: "Author" }, href: `/post/${context.post._id}` }
            : null;
    };
    return { postId: postId.toHexString(), resolvePreview, reads: () => reads };
}

async function assertAllowed(input: Parameters<typeof fixture>[0], actorDid = writerDid) {
    const access = fixture(input);
    const canonical = await resolveSharedOriginalForWrite(
        access.postId.toUpperCase(),
        actorDid,
        access.resolvePreview,
    );
    assert.equal(canonical, access.postId);
    assert.equal(access.reads(), 1);
}

async function assertDenied(input: Parameters<typeof fixture>[0], actorDid: string) {
    const access = fixture(input);
    await assert.rejects(
        resolveSharedOriginalForWrite(access.postId, actorDid, access.resolvePreview),
        (error: unknown) => error instanceof Error && error.message === ORIGINAL_POST_UNAVAILABLE,
    );
    assert.equal(access.reads(), 1);
}

async function main() {
    await assertAllowed({});
    await assertAllowed({ visibility: "secret", memberDid: writerDid });
    await assertAllowed({ visibility: "secret", memberDid: writerDid, moderationStatus: "paused" });
    await assertDenied({ visibility: "secret" }, outsiderDid);
    await assertDenied({ visibility: "secret" }, superadmin.did);
    assert.equal(superadmin.isSuperadmin, true);
    await assertDenied({ moderationStatus: "suspended" }, writerDid);
    await assertDenied({ moderationStatus: "removed" }, writerDid);

    for (const sourceType of ["task", "event", "funding"] as const) {
        await assertAllowed({ sourceType });
        await assertDenied({ sourceType, sourceReadable: false }, writerDid);
    }

    const malformed = fixture({});
    await assert.rejects(
        resolveSharedOriginalForWrite("not-an-object-id", writerDid, malformed.resolvePreview),
        (error: unknown) => error instanceof Error && error.message === ORIGINAL_POST_UNAVAILABLE,
    );
    assert.equal(malformed.reads(), 0);
    console.log("shared original write policy tests passed");
}

void main();
