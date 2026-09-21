import { describe, expect, mock, test } from "bun:test";
import { ObjectId } from "mongodb";
import type { Mention } from "@/models/models";
import type { CircleMentionWriteResult } from "./circle-mention-write-policy";
import {
    COMMENT_TARGET_UNAVAILABLE,
    orchestrateAuthoredCommentCreate,
    orchestrateAuthoredCommentEdit,
    prepareAuthoredComment,
} from "./comment-write-policy";

const postId = new ObjectId().toString();
const parentId = new ObjectId().toString();
const mentions: Mention[] = [{ type: "circle", id: "canonical-circle" }];

const accepted = (content = "canonical content"): CircleMentionWriteResult => ({ ok: true, content, mentions });
const canonicalize = (result: CircleMentionWriteResult = accepted()) =>
    mock(async (_content: string, _writerDid: string) => result);

const prepareInput = (overrides: Record<string, unknown> = {}) => ({
    postId,
    content: "raw content",
    writerDid: "did:writer",
    dependencies: {
        canonicalize: canonicalize(),
        findParentComment: mock(async (_id: ObjectId): Promise<{ postId: string } | null> => ({ postId })),
    },
    ...overrides,
});

describe("prepareAuthoredComment", () => {
    test("canonicalizes the content for the writer and returns the safe input", async () => {
        const input = prepareInput();

        const prepared = await prepareAuthoredComment(input);

        expect(prepared).toEqual({ content: "canonical content", mentions, parentCommentId: null });
        expect(input.dependencies.canonicalize).toHaveBeenCalledWith("raw content", "did:writer");
    });

    test("never carries the caller's raw content into the result", async () => {
        const prepared = await prepareAuthoredComment(prepareInput({ content: "[Spoofed](/circles/secret)" }));

        expect(prepared.content).toBe("canonical content");
    });

    test("does not look up a parent for a top-level comment", async () => {
        const input = prepareInput();

        await prepareAuthoredComment(input);
        await prepareAuthoredComment({ ...input, parentCommentId: null });

        expect(input.dependencies.findParentComment).not.toHaveBeenCalled();
    });

    test("throws when the mentions cannot be canonicalized, with the policy's message", async () => {
        const input = prepareInput({
            dependencies: {
                canonicalize: canonicalize({ ok: false, error: "One or more references are unavailable." }),
                findParentComment: async () => null,
            },
        });

        await expect(prepareAuthoredComment(input)).rejects.toThrow("One or more references are unavailable.");
    });

    describe("replies", () => {
        test("accepts a reply to a comment on the same post", async () => {
            const input = prepareInput({ parentCommentId: parentId });

            const prepared = await prepareAuthoredComment(input);

            expect(prepared.parentCommentId).toBe(parentId);
            expect(input.dependencies.findParentComment).toHaveBeenCalledWith(new ObjectId(parentId));
        });

        test("normalizes the parent id before looking it up but returns the caller's value", async () => {
            const input = prepareInput({ parentCommentId: parentId.toUpperCase() });

            const prepared = await prepareAuthoredComment(input);

            expect(prepared.parentCommentId).toBe(parentId.toUpperCase());
            expect(input.dependencies.findParentComment.mock.calls[0][0].toHexString()).toBe(parentId);
        });

        test("compares post ids by their normalized form", async () => {
            const input = prepareInput({
                postId: postId.toUpperCase(),
                parentCommentId: parentId,
                dependencies: { canonicalize: canonicalize(), findParentComment: async () => ({ postId }) },
            });

            expect((await prepareAuthoredComment(input)).parentCommentId).toBe(parentId);
        });

        test("accepts a parent whose postId is stored as an ObjectId", async () => {
            const input = prepareInput({
                parentCommentId: parentId,
                dependencies: {
                    canonicalize: canonicalize(),
                    findParentComment: async () => ({ postId: new ObjectId(postId) }),
                },
            });

            expect((await prepareAuthoredComment(input)).parentCommentId).toBe(parentId);
        });

        test.each([["not-an-id"], ["123"], ["zzzzzzzzzzzzzzzzzzzzzzzz"]])("rejects the invalid parent id %p", async (bad) => {
            const input = prepareInput({ parentCommentId: bad });

            await expect(prepareAuthoredComment(input)).rejects.toThrow(COMMENT_TARGET_UNAVAILABLE);
            expect(input.dependencies.findParentComment).not.toHaveBeenCalled();
            expect(input.dependencies.canonicalize).not.toHaveBeenCalled();
        });

        test("rejects a parent that does not exist", async () => {
            const input = prepareInput({
                parentCommentId: parentId,
                dependencies: { canonicalize: canonicalize(), findParentComment: async () => null },
            });

            await expect(prepareAuthoredComment(input)).rejects.toThrow(COMMENT_TARGET_UNAVAILABLE);
        });

        test("rejects a parent that belongs to a different post", async () => {
            const input = prepareInput({
                parentCommentId: parentId,
                dependencies: { canonicalize: canonicalize(), findParentComment: async () => ({ postId: new ObjectId().toString() }) },
            });

            await expect(prepareAuthoredComment(input)).rejects.toThrow(COMMENT_TARGET_UNAVAILABLE);
        });

        test("rejects a parent whose post id is malformed", async () => {
            const input = prepareInput({
                parentCommentId: parentId,
                dependencies: { canonicalize: canonicalize(), findParentComment: async () => ({ postId: "garbage" }) },
            });

            await expect(prepareAuthoredComment(input)).rejects.toThrow(COMMENT_TARGET_UNAVAILABLE);
        });

        test("does not canonicalize content for a rejected parent", async () => {
            const input = prepareInput({
                parentCommentId: parentId,
                dependencies: { canonicalize: canonicalize(), findParentComment: async () => null },
            });

            await expect(prepareAuthoredComment(input)).rejects.toThrow();
            expect(input.dependencies.canonicalize).not.toHaveBeenCalled();
        });
    });

    test("exposes a stable unavailable message that does not reveal which check failed", () => {
        expect(COMMENT_TARGET_UNAVAILABLE).toBe("Comment target unavailable.");
    });
});

describe("orchestrateAuthoredCommentCreate", () => {
    const createInput = (overrides: Record<string, unknown> = {}) => {
        const calls: string[] = [];
        const dependencies = {
            canonicalize: mock(async (_content: string, _did: string) => {
                calls.push("canonicalize");
                return accepted();
            }),
            findParentComment: mock(async (_id: ObjectId) => ({ postId })),
            insert: mock(async (_prepared: unknown, _postId: string) => {
                calls.push("insert");
                return { _id: "inserted-comment" };
            }),
            incrementParentReplies: mock(async (_id: string) => void calls.push("increment")),
            notify: mock(async (_inserted: unknown, _prepared: unknown) => void calls.push("notify")),
        };
        return { calls, dependencies, input: { postId, content: "raw", writerDid: "did:writer", dependencies, ...overrides } };
    };

    test("prepares, inserts and notifies for a top-level comment", async () => {
        const { calls, dependencies, input } = createInput();

        const result = await orchestrateAuthoredCommentCreate(input);

        expect(calls).toEqual(["canonicalize", "insert", "notify"]);
        expect(result.inserted).toEqual({ _id: "inserted-comment" });
        expect(result.prepared).toEqual({ content: "canonical content", mentions, parentCommentId: null });
        expect(dependencies.insert).toHaveBeenCalledWith(result.prepared, postId);
        expect(dependencies.notify).toHaveBeenCalledWith(result.inserted, result.prepared);
        expect(dependencies.incrementParentReplies).not.toHaveBeenCalled();
    });

    test("also bumps the reply count of the parent for a reply, before notifying", async () => {
        const { calls, dependencies, input } = createInput({ parentCommentId: parentId });

        await orchestrateAuthoredCommentCreate(input);

        expect(calls).toEqual(["canonicalize", "insert", "increment", "notify"]);
        expect(dependencies.incrementParentReplies).toHaveBeenCalledWith(parentId);
    });

    test("inserts the canonical post id passed in, not one derived from the parent", async () => {
        const { dependencies, input } = createInput({ parentCommentId: parentId });

        await orchestrateAuthoredCommentCreate(input);

        expect(dependencies.insert.mock.calls[0][1]).toBe(postId);
    });

    test("writes nothing when preparation fails", async () => {
        const { dependencies, input } = createInput({ parentCommentId: "not-an-id" });

        await expect(orchestrateAuthoredCommentCreate(input)).rejects.toThrow(COMMENT_TARGET_UNAVAILABLE);

        expect(dependencies.insert).not.toHaveBeenCalled();
        expect(dependencies.incrementParentReplies).not.toHaveBeenCalled();
        expect(dependencies.notify).not.toHaveBeenCalled();
    });

    test("writes nothing when the mentions are rejected", async () => {
        const { dependencies, input } = createInput();
        dependencies.canonicalize.mockResolvedValue({ ok: false, error: "nope" } as never);

        await expect(orchestrateAuthoredCommentCreate(input)).rejects.toThrow("nope");

        expect(dependencies.insert).not.toHaveBeenCalled();
    });

    test("does not notify or bump replies when the insert fails", async () => {
        const { dependencies, input } = createInput({ parentCommentId: parentId });
        dependencies.insert.mockRejectedValue(new Error("insert failed"));

        await expect(orchestrateAuthoredCommentCreate(input)).rejects.toThrow("insert failed");

        expect(dependencies.incrementParentReplies).not.toHaveBeenCalled();
        expect(dependencies.notify).not.toHaveBeenCalled();
    });

    test("does not notify when bumping the reply count fails", async () => {
        const { dependencies, input } = createInput({ parentCommentId: parentId });
        dependencies.incrementParentReplies.mockRejectedValue(new Error("increment failed"));

        await expect(orchestrateAuthoredCommentCreate(input)).rejects.toThrow("increment failed");

        expect(dependencies.notify).not.toHaveBeenCalled();
    });

    test("propagates notification failures after the comment is stored", async () => {
        const { calls, dependencies, input } = createInput();
        dependencies.notify.mockRejectedValue(new Error("notify failed"));

        await expect(orchestrateAuthoredCommentCreate(input)).rejects.toThrow("notify failed");

        expect(calls).toContain("insert");
    });
});

describe("orchestrateAuthoredCommentEdit", () => {
    const editInput = (overrides: Record<string, unknown> = {}) => {
        const dependencies = {
            canonicalize: canonicalize(),
            update: mock(async (_content: string, _mentions: Mention[]) => ({ updated: true })),
            notify: mock(async (_updated: unknown, _mentions: Mention[]) => {}),
        };
        return { dependencies, input: { postId, content: "raw edit", writerDid: "did:writer", dependencies, ...overrides } };
    };

    test("stores the canonical content and mentions, then notifies", async () => {
        const { dependencies, input } = editInput();

        const result = await orchestrateAuthoredCommentEdit(input);

        expect(result).toEqual({ updated: true });
        expect(dependencies.canonicalize).toHaveBeenCalledWith("raw edit", "did:writer");
        expect(dependencies.update).toHaveBeenCalledWith("canonical content", mentions);
        expect(dependencies.notify).toHaveBeenCalledWith({ updated: true }, mentions);
    });

    test("updates before notifying", async () => {
        const order: string[] = [];
        const { dependencies, input } = editInput();
        dependencies.update.mockImplementation(async () => (order.push("update"), { updated: true }));
        dependencies.notify.mockImplementation(async () => void order.push("notify"));

        await orchestrateAuthoredCommentEdit(input);

        expect(order).toEqual(["update", "notify"]);
    });

    test("writes nothing when the mentions are rejected", async () => {
        const { dependencies, input } = editInput();
        dependencies.canonicalize.mockResolvedValue({ ok: false, error: "One or more references are unavailable." });

        await expect(orchestrateAuthoredCommentEdit(input)).rejects.toThrow("One or more references are unavailable.");

        expect(dependencies.update).not.toHaveBeenCalled();
        expect(dependencies.notify).not.toHaveBeenCalled();
    });

    test("does not notify when the update fails", async () => {
        const { dependencies, input } = editInput();
        dependencies.update.mockRejectedValue(new Error("update failed"));

        await expect(orchestrateAuthoredCommentEdit(input)).rejects.toThrow("update failed");

        expect(dependencies.notify).not.toHaveBeenCalled();
    });
});
