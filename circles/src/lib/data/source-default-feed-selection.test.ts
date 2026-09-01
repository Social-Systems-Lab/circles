import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ObjectId } from "mongodb";
import type { Feed, Post } from "@/models/models";
import { createInitialCommentShadow } from "./initial-comment-shadow";

async function main() {
    const sourceTypes = ["task", "goal", "issue", "proposal", "event"] as const;
    const circleId = new ObjectId().toHexString();
    const communityFeed = { _id: new ObjectId(), circleId, handle: "community" } as Feed;
    const defaultFeed = { _id: new ObjectId(), circleId, handle: "default" } as Feed;
    const feeds = [communityFeed, defaultFeed];

    for (const sourceType of sourceTypes) {
        const createdPosts: Array<Omit<Post, "_id">> = [];
        const source = { commentPostId: undefined as string | undefined };
        let feedQueries = 0;
        let linkCalls = 0;

        const shadow = await createInitialCommentShadow(
            circleId,
            {
                createdBy: "did:example:creator",
                createdAt: new Date(),
                content: `${sourceType}: fixture`,
                postType: sourceType,
                parentItemId: new ObjectId().toHexString(),
                parentItemType: sourceType,
                userGroups: [],
                comments: 0,
                reactions: {},
            },
            {
                findFeed: async (query) => {
                    feedQueries++;
                    return (
                        feeds.find((feed) => feed.circleId === query.circleId && feed.handle === query.handle) ?? null
                    );
                },
                createShadow: async (post) => {
                    createdPosts.push(post);
                    return { ...post, _id: new ObjectId() } as Post;
                },
            },
        );

        if (shadow?._id) {
            linkCalls++;
            source.commentPostId = shadow._id.toString();
        }

        assert.equal(feedQueries, 1, `${sourceType} performs one canonical Feed lookup`);
        assert.equal(createdPosts.length, 1, `${sourceType} creates one initial Comment shadow`);
        assert.equal(createdPosts[0].feedId, defaultFeed._id?.toString(), `${sourceType} uses the default Feed`);
        assert.notEqual(createdPosts[0].feedId, communityFeed._id?.toString(), `${sourceType} ignores community-first`);
        assert.equal(linkCalls, 1, `${sourceType} links exactly one created shadow`);
        assert.equal(source.commentPostId, shadow?._id?.toString(), `${sourceType} stores the created shadow backlink`);
    }

    let missingCreateCalls = 0;
    assert.equal(
        await createInitialCommentShadow(
            circleId,
            {
                createdBy: "did:example:creator",
                createdAt: new Date(),
                content: "missing default fixture",
                postType: "task",
                parentItemId: new ObjectId().toHexString(),
                parentItemType: "task",
                userGroups: [],
                comments: 0,
                reactions: {},
            },
            {
                findFeed: async (query) =>
                    feeds.find((feed) => feed.circleId === query.circleId && feed.handle === "community") ?? null,
                createShadow: async (post) => {
                    missingCreateCalls++;
                    return { ...post, _id: new ObjectId() } as Post;
                },
            },
        ),
        null,
        "a non-default Feed cannot become the initial Comment shadow Feed",
    );
    assert.equal(missingCreateCalls, 0);

    for (const sourceType of sourceTypes) {
        const source = fs.readFileSync(path.join(process.cwd(), `src/lib/data/${sourceType}.ts`), "utf8");
        assert.match(source, /createInitialCommentShadow\(/, `${sourceType} initial creator uses the behavioral seam`);
        assert.doesNotMatch(
            source,
            /Feeds\.findOne\(\{ circleId: .*?\.circleId \}\)/,
            `${sourceType} has no generic same-Circle initial shadow lookup`,
        );
    }

    const helper = fs.readFileSync(path.join(process.cwd(), "src/lib/data/initial-comment-shadow.ts"), "utf8");
    assert.match(helper, /findFeed\(\{ circleId: canonicalCircleId, handle: "default" \}\)/);

    const eventFallback = fs.readFileSync(
        path.join(process.cwd(), "src/lib/data/event-shadow-orchestration.ts"),
        "utf8",
    );
    assert.match(eventFallback, /Feeds\.findOne\(\{ circleId, handle: "default" \}\)/);
    assert.match(eventFallback, /feed\.handle !== "default"/);
    assert.match(eventFallback, /normalizeId\(feed\.circleId\) !== primaryCircleId/);

    console.log("initial source default Feed selection behavioral tests passed");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
