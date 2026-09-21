import { describe, expect, test } from "bun:test";
import { ObjectId } from "mongodb";
import { isEventShadowBound } from "./event-shadow-binding-policy";
import type { ReadablePostContext } from "./post-access-policy";

const ids = { post: new ObjectId(), event: new ObjectId(), feed: new ObjectId(), circle: new ObjectId() };

const bound = () => ({
    event: { _id: ids.event, circleId: ids.circle.toString(), commentPostId: ids.post.toString() },
    context: {
        post: {
            _id: ids.post,
            feedId: ids.feed.toString(),
            postType: "event",
            parentItemType: "event",
            parentItemId: ids.event.toString(),
        },
        feed: { _id: ids.feed, circleId: ids.circle.toString() },
        circle: { _id: ids.circle },
    } as unknown as ReadablePostContext,
});

const withPost = (overrides: Record<string, unknown>) => {
    const { event, context } = bound();
    return { event, context: { ...context, post: { ...context.post, ...overrides } } as ReadablePostContext };
};

describe("isEventShadowBound", () => {
    test("is true when the event, its comment post, feed and circle all point at each other", () => {
        const { event, context } = bound();

        expect(isEventShadowBound(event, context)).toBe(true);
    });

    test.each(["event", "discussion"])("accepts a %s post", (postType) => {
        const { event, context } = withPost({ postType });

        expect(isEventShadowBound(event, context)).toBe(true);
    });

    test.each(["post", "task", "community", undefined])("rejects a %p post", (postType) => {
        const { event, context } = withPost({ postType });

        expect(isEventShadowBound(event, context)).toBe(false);
    });

    test("compares ids by value across string and ObjectId representations", () => {
        const { event, context } = bound();
        const asObjectIds = {
            ...context,
            post: { ...context.post, feedId: ids.feed, parentItemId: ids.event },
            feed: { ...context.feed, circleId: ids.circle },
        } as unknown as ReadablePostContext;

        expect(isEventShadowBound({ ...event, commentPostId: ids.post, circleId: ids.circle.toString() } as never, asObjectIds)).toBe(true);
    });

    describe("each link of the chain must hold", () => {
        test("the event must name this post as its comment post", () => {
            const { event, context } = bound();

            expect(isEventShadowBound({ ...event, commentPostId: new ObjectId().toString() }, context)).toBe(false);
            expect(isEventShadowBound({ ...event, commentPostId: undefined }, context)).toBe(false);
        });

        test("the post must be marked as belonging to an event", () => {
            const { event, context } = withPost({ parentItemType: "task" });

            expect(isEventShadowBound(event, context)).toBe(false);
            expect(isEventShadowBound(event, withPost({ parentItemType: undefined }).context)).toBe(false);
        });

        test("the post must name this event as its parent", () => {
            const { event, context } = withPost({ parentItemId: new ObjectId().toString() });

            expect(isEventShadowBound(event, context)).toBe(false);
        });

        test("the post must live in the feed of the context", () => {
            const { event, context } = withPost({ feedId: new ObjectId().toString() });

            expect(isEventShadowBound(event, context)).toBe(false);
        });

        test("the feed must belong to the circle of the context", () => {
            const { event, context } = bound();
            const foreignFeed = { ...context, feed: { ...context.feed, circleId: new ObjectId().toString() } } as ReadablePostContext;

            expect(isEventShadowBound(event, foreignFeed)).toBe(false);
        });

        test("the circle of the context must be the event's circle", () => {
            const { event, context } = bound();

            expect(isEventShadowBound({ ...event, circleId: new ObjectId().toString() }, context)).toBe(false);
        });
    });

    describe("ids of an unexpected type never match", () => {
        test.each([
            ["numbers", 5, 5],
            ["undefined", undefined, undefined],
            ["null", null, null],
            ["objects", { a: 1 }, { a: 1 }],
        ])("%s", (_label, postId, commentPostId) => {
            const { event, context } = bound();
            const post = { ...context.post, _id: postId } as unknown as ReadablePostContext["post"];

            expect(isEventShadowBound({ ...event, commentPostId } as never, { ...context, post })).toBe(false);
        });

        test("a string never equals an object with the same text", () => {
            const { event, context } = bound();
            const fake = { toString: () => ids.post.toString() };

            expect(isEventShadowBound({ ...event, commentPostId: fake } as never, context)).toBe(false);
        });
    });
});
