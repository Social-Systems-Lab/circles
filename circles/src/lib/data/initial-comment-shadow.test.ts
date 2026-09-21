import { describe, expect, mock, test } from "bun:test";
import { ObjectId } from "mongodb";
import type { Feed, Post } from "@/models/models";
import { mockDb } from "@/test/mock-db";

const db = mockDb();

const createPost = mock(async (post: unknown) => ({ ...(post as object), _id: "created-post" }));
mock.module("@/lib/data/feed", () => ({ createPost }));

const { createInitialCommentShadow } = await import("./initial-comment-shadow");

const circleId = new ObjectId().toString();
const feedId = new ObjectId();
const input = { title: "Shadow", content: "x", createdBy: "did:author", postType: "event" } as unknown as Omit<Post, "_id" | "feedId">;

const feed = (overrides: Record<string, unknown> = {}) =>
    ({ _id: feedId, handle: "default", circleId, ...overrides }) as unknown as Feed;

const dependencies = (foundFeed: Feed | null) => ({
    findFeed: mock(async (_query: { circleId: string; handle: "default" }) => foundFeed),
    createShadow: mock(async (post: Omit<Post, "_id">) => ({ ...post, _id: "shadow-id" }) as unknown as Post),
});

describe("createInitialCommentShadow", () => {
    test("creates the shadow post in the default feed of the circle", async () => {
        const deps = dependencies(feed());

        const result = await createInitialCommentShadow(circleId, input, deps);

        expect(result).toMatchObject({ _id: "shadow-id", title: "Shadow", feedId: feedId.toString() });
        expect(deps.findFeed).toHaveBeenCalledWith({ circleId, handle: "default" });
        expect(deps.createShadow).toHaveBeenCalledWith({ ...input, feedId: feedId.toString() });
    });

    test("looks the feed up by the normalized circle id", async () => {
        const deps = dependencies(feed());

        await createInitialCommentShadow(circleId.toUpperCase(), input, deps);

        expect(deps.findFeed).toHaveBeenCalledWith({ circleId, handle: "default" });
    });

    test("overrides a feed id supplied in the input with the one it verified", async () => {
        const deps = dependencies(feed());

        await createInitialCommentShadow(circleId, { ...input, feedId: "attacker-feed" } as never, deps);

        expect(deps.createShadow).toHaveBeenCalledWith(expect.objectContaining({ feedId: feedId.toString() }));
    });

    test.each([[""], ["not-an-id"], [undefined as unknown as string], [42 as unknown as string]])(
        "returns null without querying for the invalid circle id %p",
        async (bad) => {
            const deps = dependencies(feed());

            expect(await createInitialCommentShadow(bad, input, deps)).toBeNull();
            expect(deps.findFeed).not.toHaveBeenCalled();
            expect(deps.createShadow).not.toHaveBeenCalled();
        },
    );

    test.each([
        ["there is no feed", null],
        ["the feed is not the default feed", feed({ handle: "community" })],
        ["the feed belongs to another circle", feed({ circleId: new ObjectId().toString() })],
        ["the feed has no circle", feed({ circleId: undefined })],
        ["the feed has an invalid id", feed({ _id: "garbage" })],
        ["the feed has no id", feed({ _id: undefined })],
    ])("returns null when %s", async (_label, foundFeed) => {
        const deps = dependencies(foundFeed);

        expect(await createInitialCommentShadow(circleId, input, deps)).toBeNull();
        expect(deps.createShadow).not.toHaveBeenCalled();
    });

    test("accepts a feed whose ids are stored as ObjectIds", async () => {
        const deps = dependencies(feed({ circleId: new ObjectId(circleId) }));

        expect(await createInitialCommentShadow(circleId, input, deps)).not.toBeNull();
    });

    test("propagates failures from creating the shadow", async () => {
        const deps = dependencies(feed());
        deps.createShadow.mockRejectedValue(new Error("create failed"));

        await expect(createInitialCommentShadow(circleId, input, deps)).rejects.toThrow("create failed");
    });

    describe("default dependencies", () => {
        test("read the default feed from the database and create the post through the feed module", async () => {
            db.Feeds.docs = [
                { _id: feedId, handle: "default", circleId },
                { _id: new ObjectId(), handle: "default", circleId: new ObjectId().toString() },
            ];
            createPost.mockClear();

            const result = await createInitialCommentShadow(circleId, input);

            expect(result).toMatchObject({ _id: "created-post", feedId: feedId.toString() });
            expect(createPost).toHaveBeenCalledWith({ ...input, feedId: feedId.toString() });
        });

        test("return null when the circle has no default feed", async () => {
            db.Feeds.docs = [];
            createPost.mockClear();

            expect(await createInitialCommentShadow(circleId, input)).toBeNull();
            expect(createPost).not.toHaveBeenCalled();
        });
    });
});
