import { beforeEach, describe, expect, mock, test } from "bun:test";
import { ObjectId } from "mongodb";
import { silenceConsole, useFakeNow } from "@/test/hooks";
import { mockDb } from "@/test/mock-db";

const db = mockDb();

const authors = new Map<string, Record<string, unknown>>();
const getUserByDid = mock(async (did: string) => authors.get(did) ?? null);
mock.module("@/lib/data/user", () => ({ getUserByDid }));

const upsertVbdPosts = mock(async (_posts: unknown[]) => {});
mock.module("@/lib/data/vdb", () => ({ upsertVbdPosts }));

const discussions = await import("./discussion");

const NOW = new Date("2026-06-15T12:00:00.000Z");
useFakeNow(NOW);
const consoleSpy = silenceConsole("error");

const feedId = new ObjectId();
const circleId = new ObjectId();

const seedDiscussion = (overrides: Record<string, unknown> = {}) => {
    const _id = new ObjectId();
    db.Posts.docs.push({
        _id,
        title: "Topic",
        postType: "discussion",
        circleId: circleId.toString(),
        feedId: feedId.toString(),
        createdBy: "did:author",
        pinned: false,
        closed: false,
        createdAt: NOW,
        ...overrides,
    });
    return _id;
};

beforeEach(() => {
    db.Posts.docs = [];
    db.Posts.onAggregate = undefined;
    db.Posts.aggregations = [];
    db.Comments.docs = [];
    authors.clear();
    authors.set("did:author", { did: "did:author", name: "Ada" });
    getUserByDid.mockClear();
    upsertVbdPosts.mockReset();
    upsertVbdPosts.mockResolvedValue(undefined);
});

describe("createDiscussion", () => {
    const input = { title: "Topic", content: "Body", circleId: circleId.toString(), feedId: feedId.toString(), createdBy: "did:author" };

    test("stores an open, unpinned discussion visible to everyone", async () => {
        const created = await discussions.createDiscussion(input);

        expect(db.Posts.docs).toHaveLength(1);
        expect(db.Posts.docs[0]).toMatchObject({
            title: "Topic",
            content: "Body",
            circleId: circleId.toString(),
            feedId: feedId.toString(),
            createdBy: "did:author",
            userGroups: ["everyone"],
            postType: "discussion",
            pinned: false,
            closed: false,
            createdAt: NOW,
            lastActivityAt: NOW,
        });
        expect(created._id).toBe(db.Posts.docs[0]._id.toString());
    });

    test("defaults missing content, media and mentions to empty", async () => {
        await discussions.createDiscussion({ circleId: circleId.toString(), title: "T" });

        expect(db.Posts.docs[0]).toMatchObject({ content: "", media: [], mentions: [] });
    });

    test("keeps media, mentions and location when given", async () => {
        const media = [{ name: "a.png" }];
        const mentions = [{ type: "circle", id: "c1" }];
        const location = { precision: 2, city: "Malmo" };

        await discussions.createDiscussion({ ...input, media, mentions, location } as never);

        expect(db.Posts.docs[0]).toMatchObject({ media, mentions, location });
    });

    test("ignores a client-supplied post type, pin state or group list", async () => {
        await discussions.createDiscussion({ ...input, postType: "post", pinned: true, closed: true, userGroups: ["admins"] } as never);

        expect(db.Posts.docs[0]).toMatchObject({ postType: "discussion", pinned: false, closed: false, userGroups: ["everyone"] });
    });

    test("attaches the author's profile", async () => {
        const created = await discussions.createDiscussion(input);

        expect(created.author).toEqual({ did: "did:author", name: "Ada" });
    });

    test("does not fail when the author cannot be found", async () => {
        authors.clear();

        const created = await discussions.createDiscussion(input);

        expect(created.author).toBeUndefined();
    });

    test("does not look up an author for a discussion without one", async () => {
        await discussions.createDiscussion({ circleId: circleId.toString(), title: "T" });

        expect(getUserByDid).not.toHaveBeenCalled();
    });

    test("indexes the new discussion for search", async () => {
        const created = await discussions.createDiscussion(input);

        expect(upsertVbdPosts).toHaveBeenCalledWith([created]);
    });

    test("still creates the discussion when indexing fails, and logs it", async () => {
        upsertVbdPosts.mockRejectedValue(new Error("qdrant down"));

        const created = await discussions.createDiscussion(input);

        expect(created._id).toBeString();
        expect(consoleSpy.error).toHaveBeenCalledWith("Failed to upsert discussion embedding", expect.any(Error));
    });
});

describe("listDiscussionsByCircle", () => {
    const list = () => discussions.listDiscussionsByCircle(circleId.toString(), feedId.toString());

    test("returns the discussions of the circle's feed with string ids", async () => {
        const id = seedDiscussion();

        const result = await list();

        expect(result).toHaveLength(1);
        expect(result[0]._id).toBe(id.toString());
    });

    test("lists pinned discussions first, then newest first", async () => {
        seedDiscussion({ title: "old", createdAt: new Date(NOW.getTime() - 3000) });
        seedDiscussion({ title: "new", createdAt: new Date(NOW.getTime() - 1000) });
        seedDiscussion({ title: "pinned but old", pinned: true, createdAt: new Date(NOW.getTime() - 9000) });

        expect((await list()).map((d: { title: string }) => d.title)).toEqual(["pinned but old", "new", "old"]);
    });

    test("only includes discussions of that circle and feed", async () => {
        seedDiscussion();
        seedDiscussion({ circleId: new ObjectId().toString() });
        seedDiscussion({ feedId: new ObjectId().toString() });
        seedDiscussion({ postType: "post" });

        expect(await list()).toHaveLength(1);
    });

    test("attaches each author", async () => {
        seedDiscussion();

        expect((await list())[0].author).toEqual({ did: "did:author", name: "Ada" });
    });

    test("leaves discussions without a known author unchanged", async () => {
        authors.clear();
        seedDiscussion();
        seedDiscussion({ createdBy: undefined });

        const result = await list();

        expect(result).toHaveLength(2);
        expect(result.every((d: { author?: unknown }) => d.author === undefined)).toBe(true);
    });

    test("keeps listing when one author lookup fails, and logs it", async () => {
        seedDiscussion({ title: "first" });
        seedDiscussion({ title: "second", createdBy: "did:broken" });
        getUserByDid.mockImplementation(async (did: string) => {
            if (did === "did:broken") throw new Error("db down");
            return authors.get(did) ?? null;
        });

        const result = await list();

        expect(result).toHaveLength(2);
        expect(consoleSpy.error).toHaveBeenCalledWith("Failed to fetch author for discussion", expect.any(Error));
        getUserByDid.mockImplementation(async (did: string) => authors.get(did) ?? null);
    });

    test("returns nothing for an empty feed", async () => {
        expect(await list()).toEqual([]);
    });
});

describe("getDiscussionWithComments", () => {
    test("returns null when nothing matches", async () => {
        db.Posts.onAggregate = () => [];

        expect(await discussions.getDiscussionWithComments(new ObjectId().toString())).toBeNull();
    });

    test("returns the hydrated discussion with its id as a string and its comments as DTOs", async () => {
        const id = new ObjectId();
        db.Posts.onAggregate = () => [{ _id: id, title: "Topic", feed: { _id: feedId }, circle: { _id: circleId } }];
        db.Comments.docs = [
            { _id: new ObjectId(), postId: id.toString(), content: "hello", createdBy: "did:a", createdAt: NOW, reactions: {}, mentions: [{ type: "circle", id: "secret" }] },
            { _id: new ObjectId(), postId: "other-post", content: "elsewhere", createdBy: "did:a", createdAt: NOW, reactions: {} },
        ];

        const discussion = await discussions.getDiscussionWithComments(id.toString());

        expect(discussion._id).toBe(id.toString());
        expect(discussion.comments.map((c: { content: string }) => c.content)).toEqual(["hello"]);
        expect(discussion.comments[0]).not.toHaveProperty("mentions");
    });

    test("without an authorized feed, matches the discussion by id and type", async () => {
        const id = new ObjectId();
        db.Posts.onAggregate = () => [];

        await discussions.getDiscussionWithComments(id.toString());

        expect(db.Posts.aggregations[0][0]).toEqual({ $match: { _id: id, postType: "discussion" } });
    });

    test("with an authorized feed, also requires the discussion to live in that feed", async () => {
        const id = new ObjectId();
        db.Posts.onAggregate = () => [];

        await discussions.getDiscussionWithComments(id.toString(), feedId.toString());

        expect(db.Posts.aggregations[0][0]).toEqual({ $match: { _id: id, feedId: feedId.toHexString(), postType: "discussion" } });
    });

    test.each([["a bad discussion id", "bogus", undefined], ["a bad feed id", undefined, "bogus"]])("returns null without querying for %s", async (_label, badId, badFeed) => {
        const id = badId ?? new ObjectId().toString();

        expect(await discussions.getDiscussionWithComments(id, badFeed ?? feedId.toString())).toBeNull();
        expect(db.Posts.aggregations).toHaveLength(0);
    });

    test("joins the author, feed and circle and only keeps discussions whose feed belongs to their circle", async () => {
        db.Posts.onAggregate = () => [];

        await discussions.getDiscussionWithComments(new ObjectId().toString());

        const pipeline = db.Posts.aggregations[0];
        expect(pipeline.filter((stage) => "$lookup" in stage).map((stage) => stage.$lookup.from)).toEqual(["circles", "feeds", "circles"]);
        const consistency = pipeline.find((stage) => "$match" in stage && "$expr" in stage.$match)!;
        expect(JSON.stringify(consistency)).toContain('"$circleId"');
    });
});

describe("addCommentToDiscussion", () => {
    const add = (id: ObjectId, data: Record<string, unknown> = {}) =>
        discussions.addCommentToDiscussion(id.toString(), { content: "hello", createdBy: "did:author", ...data } as never, undefined);

    test("adds the comment to an open discussion, records the activity and returns its DTO", async () => {
        const id = seedDiscussion();
        db.PlatformSettingsCollection.docs = [];
        // The default dependencies validate mentions through the mention policy, which needs no mentions here.
        const result = (await discussions.addCommentToDiscussion(id.toString(), { content: "hello", createdBy: "did:author" }, {
            findDiscussion: async (postId) => db.Posts.docs.find((doc) => doc._id.equals(postId)) as never,
            insertComment: async (comment) => db.Comments.insertOne(comment as never) as never,
            incrementParentReplies: async () => {},
            updateLastActivity: async (postId, at) => void (await db.Posts.updateOne({ _id: postId }, { $set: { lastActivityAt: at } })),
            now: () => NOW,
            prepareComment: async (input) => ({ content: input.content, mentions: [], parentCommentId: null }),
            findParentComment: async () => null,
        })) as { content: string; _id: string };

        expect(result.content).toBe("hello");
        expect(db.Comments.docs).toHaveLength(1);
        expect(db.Posts.byId(id)?.lastActivityAt).toEqual(NOW);
    });

    test("is refused for a discussion that is closed or does not exist, by the default dependencies", async () => {
        const closed = seedDiscussion({ closed: true });

        await expect(add(closed)).rejects.toThrow("Forum post is closed or not found");
        await expect(add(new ObjectId())).rejects.toThrow("Forum post is closed or not found");
        expect(db.Comments.docs).toHaveLength(0);
    });

    test("does not treat posts that are not discussions as discussions", async () => {
        const post = seedDiscussion({ postType: "post" });

        await expect(add(post)).rejects.toThrow("Forum post is closed or not found");
    });
});

describe("pinDiscussion / closeDiscussion", () => {
    test("pins and unpins a discussion", async () => {
        const id = seedDiscussion();

        await discussions.pinDiscussion(id.toString(), true);
        expect(db.Posts.byId(id)?.pinned).toBe(true);

        await discussions.pinDiscussion(id.toString(), false);
        expect(db.Posts.byId(id)?.pinned).toBe(false);
    });

    test("closes a discussion", async () => {
        const id = seedDiscussion();

        await discussions.closeDiscussion(id.toString());

        expect(db.Posts.byId(id)?.closed).toBe(true);
    });

    test("only touch the given discussion", async () => {
        const target = seedDiscussion();
        const other = seedDiscussion();

        await discussions.pinDiscussion(target.toString(), true);
        await discussions.closeDiscussion(target.toString());

        expect(db.Posts.byId(other)).toMatchObject({ pinned: false, closed: false });
    });

    test("report whether the discussion existed", async () => {
        expect((await discussions.pinDiscussion(new ObjectId().toString(), true)).matchedCount).toBe(0);
        expect((await discussions.closeDiscussion(new ObjectId().toString())).matchedCount).toBe(0);
    });

    test("throw for an id that is not an ObjectId", async () => {
        await expect(discussions.pinDiscussion("bogus", true)).rejects.toThrow();
        await expect(discussions.closeDiscussion("bogus")).rejects.toThrow();
    });
});
