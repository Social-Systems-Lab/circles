import { describe, expect, mock, test } from "bun:test";
import { ObjectId } from "mongodb";
import type { Comment } from "@/models/models";
import { mockDb } from "@/test/mock-db";

const db = mockDb();

const { getCommentDtosForAuthorizedPost } = await import("./authorized-comment-read");

const comment = (overrides: Record<string, unknown> = {}) =>
    ({
        _id: new ObjectId(),
        postId: "post-1",
        parentCommentId: null,
        content: "hello",
        createdBy: "did:author",
        createdAt: new Date("2026-06-15T12:00:00.000Z"),
        reactions: { like: 1 },
        replies: 0,
        // Fields the DTO must not leak.
        mentions: [{ type: "circle", id: "secret" }],
        author: { private: true },
        ...overrides,
    }) as unknown as Comment;

describe("getCommentDtosForAuthorizedPost", () => {
    test("returns a DTO for every comment of the post", async () => {
        const first = comment();
        const second = comment({ content: "second" });

        const result = await getCommentDtosForAuthorizedPost("post-1", { findComments: async () => [first, second] });

        expect(result.map((dto) => dto._id)).toEqual([first._id.toString(), second._id.toString()]);
        expect(result[1].content).toBe("second");
    });

    test("asks for the comments of the given post", async () => {
        const findComments = mock(async (_postId: string) => [] as Comment[]);

        await getCommentDtosForAuthorizedPost("post-42", { findComments });

        expect(findComments).toHaveBeenCalledWith("post-42");
    });

    test("strips fields that must not cross the DTO boundary", async () => {
        const [dto] = await getCommentDtosForAuthorizedPost("post-1", { findComments: async () => [comment()] });

        expect(Object.hasOwn(dto, "mentions")).toBe(false);
        expect(Object.hasOwn(dto, "author")).toBe(false);
    });

    test("returns an empty list when the post has no comments", async () => {
        expect(await getCommentDtosForAuthorizedPost("post-1", { findComments: async () => [] })).toEqual([]);
    });

    test("propagates lookup failures", async () => {
        await expect(
            getCommentDtosForAuthorizedPost("post-1", {
                findComments: async () => {
                    throw new Error("db down");
                },
            }),
        ).rejects.toThrow("db down");
    });

    describe("default lookup", () => {
        test("reads the comments of the post from the Comments collection", async () => {
            db.Comments.docs = [
                { _id: new ObjectId(), postId: "post-1", content: "mine", createdBy: "did:a", createdAt: new Date(), reactions: {} },
                { _id: new ObjectId(), postId: "post-2", content: "theirs", createdBy: "did:b", createdAt: new Date(), reactions: {} },
            ];

            const result = await getCommentDtosForAuthorizedPost("post-1");

            expect(result.map((dto) => dto.content)).toEqual(["mine"]);
        });

        test("returns an empty list for a post without comments", async () => {
            db.Comments.docs = [];

            expect(await getCommentDtosForAuthorizedPost("post-1")).toEqual([]);
        });
    });
});
