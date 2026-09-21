import { describe, expect, test } from "bun:test";
import { ObjectId } from "mongodb";
import { useFakeNow } from "@/test/hooks";
import { buildEventNoticeboardPostData } from "./event-noticeboard-post-policy";

const NOW = new Date("2026-06-15T12:00:00.000Z");
const eventId = new ObjectId();

const input = (overrides: Partial<Parameters<typeof buildEventNoticeboardPostData>[0]["event"]> = {}) => ({
    event: { _id: eventId, title: "Beach cleanup", description: "Bring gloves", createdBy: "did:host", ...overrides },
    feedId: "feed-1",
    internalPreviewUrl: "/circles/demo/events/abc",
});

describe("buildEventNoticeboardPostData", () => {
    useFakeNow(NOW);

    test("builds a noticeboard post that previews the event", () => {
        expect(buildEventNoticeboardPostData(input())).toEqual({
            title: "Beach cleanup",
            content: "Attend this event. Bring gloves",
            feedId: "feed-1",
            createdBy: "did:host",
            createdAt: NOW,
            editedAt: NOW,
            reactions: {},
            comments: 0,
            userGroups: ["admins", "moderators", "members"],
            postType: "post",
            internalPreviewType: "event",
            internalPreviewId: eventId.toString(),
            internalPreviewUrl: "/circles/demo/events/abc",
            parentItemType: "event",
            parentItemId: eventId.toString(),
        });
    });

    test("returns null when the event has no id", () => {
        expect(buildEventNoticeboardPostData(input({ _id: undefined }))).toBeNull();
    });

    test("uses a generic sentence when the description is empty or whitespace", () => {
        expect(buildEventNoticeboardPostData(input({ description: "" }))?.content).toBe("Attend this event.");
        expect(buildEventNoticeboardPostData(input({ description: "  \n\t " }))?.content).toBe("Attend this event.");
    });

    test("trims the description before appending it", () => {
        expect(buildEventNoticeboardPostData(input({ description: "  Bring gloves \n" }))?.content).toBe(
            "Attend this event. Bring gloves",
        );
    });

    test("stamps createdAt and editedAt with the current time", () => {
        const post = buildEventNoticeboardPostData(input());
        expect(post?.createdAt?.getTime()).toBe(NOW.getTime());
        expect(post?.editedAt?.getTime()).toBe(NOW.getTime());
        expect(post?.createdAt).not.toBe(post?.editedAt);
    });

    test("does not share mutable containers between calls", () => {
        const first = buildEventNoticeboardPostData(input());
        const second = buildEventNoticeboardPostData(input());
        expect(first?.userGroups).not.toBe(second?.userGroups);
        expect(first?.reactions).not.toBe(second?.reactions);
    });

    test("throws when the event has no description at all", () => {
        expect(() => buildEventNoticeboardPostData(input({ description: undefined as unknown as string }))).toThrow();
    });
});
