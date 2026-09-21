import { describe, expect, mock, test } from "bun:test";
import { ObjectId } from "mongodb";
import type { Event, Post } from "@/models/models";
import { features } from "./constants";
import {
    type CommentDetailSource,
    normalizeCommentTargetId,
    resolveCommentSemanticTarget,
} from "./comment-semantic-target-policy";
import type { ReadablePostContext } from "./post-access-policy";

const postId = new ObjectId();
const sourceId = new ObjectId();
const HEX = "507f1f77bcf86cd799439011";

const contextFor = (post: Record<string, unknown>) =>
    ({ post: { _id: postId, ...post }, feed: {}, circle: {} }) as unknown as ReadablePostContext;

type FindSource = Parameters<typeof resolveCommentSemanticTarget>[2];
const finding = (source: unknown) => mock<FindSource>(async () => source as CommentDetailSource | Event | null);

describe("normalizeCommentTargetId", () => {
    test("normalizes ObjectIds and valid id strings to lowercase hex", () => {
        expect(normalizeCommentTargetId(new ObjectId(HEX))).toBe(HEX);
        expect(normalizeCommentTargetId(HEX)).toBe(HEX);
        expect(normalizeCommentTargetId(HEX.toUpperCase())).toBe(HEX);
    });

    test.each([
        ["undefined", undefined],
        ["null", null],
        ["a number", 123456789012],
        ["an object", { toString: () => HEX }],
        ["an array", [HEX]],
        ["an empty string", ""],
        ["a malformed string", "not-an-id"],
        ["a 23 character string", HEX.slice(0, 23)],
        ["a 12 character non-hex string", "abcdefghijkl"],
    ])("returns null for %s", (_label, value) => {
        expect(normalizeCommentTargetId(value)).toBeNull();
    });

});

describe("resolveCommentSemanticTarget", () => {
    describe("ordinary posts", () => {
        test.each([undefined, "post"])("uses the noticeboard comment feature for a %p post", async (postType) => {
            const findSource = finding(null);

            const target = await resolveCommentSemanticTarget(contextFor({ postType }), postId.toString(), findSource);

            expect(target).toEqual({ commentFeature: features.feed.comment, route: { kind: "generic" } });
            expect(findSource).not.toHaveBeenCalled();
        });

        test("uses the community post feature for community posts", async () => {
            const target = await resolveCommentSemanticTarget(contextFor({ postType: "community" }), postId.toString(), finding(null));

            expect(target).toEqual({ commentFeature: features.community.post, route: { kind: "generic" } });
        });

        test("has no target for a post type that supports no comments", async () => {
            const target = await resolveCommentSemanticTarget(contextFor({ postType: "unknown" }), postId.toString(), finding(null));

            expect(target).toBeNull();
        });

        test("treats a post with a non-event parent type it does not know as a plain post", async () => {
            const target = await resolveCommentSemanticTarget(
                contextFor({ postType: "post", parentItemType: "custom", parentItemId: HEX }),
                postId.toString(),
                finding(null),
            );

            expect(target).toEqual({ commentFeature: features.feed.comment, route: { kind: "generic" } });
        });
    });

    describe("discussions", () => {
        test("routes a discussion to the discussions comment feature", async () => {
            const target = await resolveCommentSemanticTarget(contextFor({ postType: "discussion" }), postId.toString(), finding(null));

            expect(target).toEqual({ commentFeature: features.discussions.comment, route: { kind: "discussion" } });
        });
    });

    describe("detail posts (task, goal, issue, proposal)", () => {
        const detailFeature = {
            task: features.tasks.comment,
            goal: features.goals.comment,
            issue: features.issues.comment,
            proposal: features.feed.comment,
        } as const;

        test.each(["task", "goal", "issue", "proposal"] as const)(
            "resolves a %s shadow post whose source points back at it",
            async (type) => {
                const findSource = finding({ _id: sourceId, commentPostId: postId.toString() });

                const target = await resolveCommentSemanticTarget(
                    contextFor({ postType: type, parentItemType: type, parentItemId: sourceId.toString() }),
                    postId.toString(),
                    findSource,
                );

                expect(target).toEqual({ commentFeature: detailFeature[type], route: { kind: "generic" } });
                expect(findSource).toHaveBeenCalledWith(type, sourceId);
            },
        );

        const shadow = (overrides: Record<string, unknown> = {}) =>
            contextFor({ postType: "task", parentItemType: "task", parentItemId: sourceId.toString(), ...overrides });

        test("accepts a source whose backlink is an ObjectId rather than a string", async () => {
            const target = await resolveCommentSemanticTarget(
                shadow(),
                postId.toString(),
                finding({ _id: sourceId, commentPostId: postId }),
            );

            expect(target?.commentFeature).toBe(features.tasks.comment);
        });

        test("rejects a source that does not exist", async () => {
            expect(await resolveCommentSemanticTarget(shadow(), postId.toString(), finding(null))).toBeNull();
        });

        test("rejects a source that points at a different post", async () => {
            const other = new ObjectId().toString();

            expect(
                await resolveCommentSemanticTarget(shadow(), postId.toString(), finding({ _id: sourceId, commentPostId: other })),
            ).toBeNull();
        });

        test("rejects a source without a backlink", async () => {
            expect(await resolveCommentSemanticTarget(shadow(), postId.toString(), finding({ _id: sourceId }))).toBeNull();
        });

        test("rejects a source that is not the one the post claims", async () => {
            const impostor = new ObjectId();

            expect(
                await resolveCommentSemanticTarget(
                    shadow(),
                    postId.toString(),
                    finding({ _id: impostor, commentPostId: postId.toString() }),
                ),
            ).toBeNull();
        });

        test("rejects a shadow post whose parent id is invalid, without looking anything up", async () => {
            const findSource = finding(null);

            expect(await resolveCommentSemanticTarget(shadow({ parentItemId: "bogus" }), postId.toString(), findSource)).toBeNull();
            expect(findSource).not.toHaveBeenCalled();
        });

        test("does not treat a post as a detail shadow when its type differs from its parent type", async () => {
            const findSource = finding(null);

            const target = await resolveCommentSemanticTarget(
                contextFor({ postType: "post", parentItemType: "task", parentItemId: sourceId.toString() }),
                postId.toString(),
                findSource,
            );

            expect(target).toEqual({ commentFeature: features.feed.comment, route: { kind: "generic" } });
            expect(findSource).not.toHaveBeenCalled();
        });
    });

    describe("events", () => {
        const eventId = new ObjectId();
        const event = () => ({ _id: eventId, commentPostId: postId.toString() });
        const eventPost = (overrides: Record<string, unknown> = {}) =>
            contextFor({ postType: "event", parentItemType: "event", parentItemId: eventId.toString(), ...overrides });

        test.each(["event", "discussion"])("resolves the alternate %s comment post of an event", async (postType) => {
            const findSource = finding(event());

            const target = await resolveCommentSemanticTarget(eventPost({ postType }), postId.toString(), findSource);

            expect(target).toEqual({
                commentFeature: features.feed.comment,
                route: { kind: "event", eventId: eventId.toString(), event: event() },
            } as never);
            expect(findSource).toHaveBeenCalledWith("event", eventId);
        });

        test("never degrades an event post without its event marker to an ordinary feed target", async () => {
            const findSource = finding(event());

            expect(
                await resolveCommentSemanticTarget(
                    contextFor({ postType: "event", parentItemType: undefined }),
                    postId.toString(),
                    findSource,
                ),
            ).toBeNull();
            expect(
                await resolveCommentSemanticTarget(
                    contextFor({ postType: "event", parentItemType: "task", parentItemId: eventId.toString() }),
                    postId.toString(),
                    findSource,
                ),
            ).toBeNull();
            expect(findSource).not.toHaveBeenCalled();
        });

        test("rejects an alternate event post with an invalid parent id", async () => {
            const findSource = finding(event());

            expect(await resolveCommentSemanticTarget(eventPost({ parentItemId: "bogus" }), postId.toString(), findSource)).toBeNull();
            expect(await resolveCommentSemanticTarget(eventPost({ parentItemId: undefined }), postId.toString(), findSource)).toBeNull();
            expect(findSource).not.toHaveBeenCalled();
        });

        test("rejects an alternate event post whose event does not exist", async () => {
            expect(await resolveCommentSemanticTarget(eventPost(), postId.toString(), finding(null))).toBeNull();
        });

        test("rejects an alternate event post whose event points at another comment post", async () => {
            expect(
                await resolveCommentSemanticTarget(
                    eventPost(),
                    postId.toString(),
                    finding({ _id: eventId, commentPostId: new ObjectId().toString() }),
                ),
            ).toBeNull();
        });

        test("rejects an alternate event post whose event is not the one it claims", async () => {
            expect(
                await resolveCommentSemanticTarget(
                    eventPost(),
                    postId.toString(),
                    finding({ _id: new ObjectId(), commentPostId: postId.toString() }),
                ),
            ).toBeNull();
        });

        test("keeps an ordinary post about an event on the generic route without loading the event", async () => {
            const findSource = finding(event());

            const target = await resolveCommentSemanticTarget(
                contextFor({ postType: "post", parentItemType: "event", parentItemId: eventId.toString() }),
                postId.toString(),
                findSource,
            );

            expect(target).toEqual({ commentFeature: features.feed.comment, route: { kind: "generic" } });
            expect(findSource).not.toHaveBeenCalled();
        });

        test.each(["task", "goal", "community", "unknown"])("rejects a %s post that claims an event parent", async (postType) => {
            const target = await resolveCommentSemanticTarget(
                contextFor({ postType, parentItemType: "event", parentItemId: eventId.toString() }),
                postId.toString(),
                finding(event()),
            );

            expect(target).toBeNull();
        });
    });
});
