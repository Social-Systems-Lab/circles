import { describe, expect, test } from "bun:test";
import { highlightedCommentFilter, highlightedCommentPointerUpdate } from "./highlighted-comment-policy";

describe("highlightedCommentFilter", () => {
    test("selects top-level comments of the post that are not deleted", () => {
        expect(highlightedCommentFilter("post-1")).toEqual({
            postId: "post-1",
            parentCommentId: null,
            isDeleted: { $ne: true },
        });
    });

    test("returns a new filter on every call", () => {
        expect(highlightedCommentFilter("post-1")).not.toBe(highlightedCommentFilter("post-1"));
    });

    test("does not validate the post id", () => {
        expect(highlightedCommentFilter("").postId).toBe("");
    });
});

describe("highlightedCommentPointerUpdate", () => {
    test("sets the pointer to the given comment", () => {
        expect(highlightedCommentPointerUpdate("comment-1")).toEqual({ $set: { highlightedCommentId: "comment-1" } });
    });

    test("clears the pointer when no comment is given", () => {
        expect(highlightedCommentPointerUpdate()).toEqual({ $unset: { highlightedCommentId: "" } });
        expect(highlightedCommentPointerUpdate(undefined)).toEqual({ $unset: { highlightedCommentId: "" } });
    });

    test("clears the pointer for an empty id rather than storing an empty string", () => {
        expect(highlightedCommentPointerUpdate("")).toEqual({ $unset: { highlightedCommentId: "" } });
    });
});
