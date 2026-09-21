import { describe, expect, mock, test } from "bun:test";
import { ObjectId } from "mongodb";
import type { Post } from "@/models/models";
import { applyPostUpdateOperation, buildPostUpdateOperation } from "./post-update-operation";

describe("buildPostUpdateOperation", () => {
    test("sets the given fields", () => {
        const post: Partial<Post> = { title: "Title", content: "Body" };

        expect(buildPostUpdateOperation(post)).toEqual({ $set: { title: "Title", content: "Body" } });
    });

    test("does not add $unset when no preview field is explicitly undefined", () => {
        const operation = buildPostUpdateOperation({ title: "Title", internalPreviewType: "event" });

        expect(operation).not.toHaveProperty("$unset");
        expect(operation.$set).toEqual({ title: "Title", internalPreviewType: "event" });
    });

    test.each(["internalPreviewType", "internalPreviewId", "internalPreviewUrl", "internalPreviewData"])(
        "unsets %s when it is explicitly undefined",
        (field) => {
            const operation = buildPostUpdateOperation({ title: "Title", [field]: undefined } as Partial<Post>);

            expect(operation).toEqual({ $set: { title: "Title" }, $unset: { [field]: "" } });
        },
    );

    test("removes the undefined preview fields from the $set", () => {
        const operation = buildPostUpdateOperation({ title: "Title", internalPreviewType: undefined } as Partial<Post>);

        expect(Object.hasOwn(operation.$set, "internalPreviewType")).toBe(false);
    });

    test("unsets several preview fields at once and keeps those with values", () => {
        const operation = buildPostUpdateOperation({
            internalPreviewType: undefined,
            internalPreviewId: undefined,
            internalPreviewUrl: "/circles/x",
        } as Partial<Post>);

        expect(operation).toEqual({
            $set: { internalPreviewUrl: "/circles/x" },
            $unset: { internalPreviewType: "", internalPreviewId: "" },
        });
    });

    test("ignores fields that are simply absent, so an update never clears a preview by omission", () => {
        expect(buildPostUpdateOperation({ title: "Title" })).toEqual({ $set: { title: "Title" } });
    });

    test("does not unset preview fields that are null, only undefined", () => {
        const operation = buildPostUpdateOperation({ internalPreviewType: null } as unknown as Partial<Post>);

        expect(operation).toEqual({ $set: { internalPreviewType: null } } as never);
    });

    test("does not unset other fields that are undefined", () => {
        const operation = buildPostUpdateOperation({ title: undefined, content: "x" });

        expect(operation).not.toHaveProperty("$unset");
        expect(operation.$set).toHaveProperty("title");
    });

    test("mutates the object it was given by deleting the unset preview fields", () => {
        const post = { title: "Title", internalPreviewUrl: undefined } as Partial<Post>;

        const operation = buildPostUpdateOperation(post);

        expect(operation.$set).toBe(post);
        expect(Object.hasOwn(post, "internalPreviewUrl")).toBe(false);
    });
});

describe("applyPostUpdateOperation", () => {
    test("updates the post by id with the built operation", async () => {
        const id = new ObjectId();
        const updateOne = mock(async (_filter: unknown, _operation: unknown) => ({ acknowledged: true }) as never);

        await applyPostUpdateOperation(updateOne, id.toString(), { title: "New", internalPreviewId: undefined } as Partial<Post>);

        expect(updateOne).toHaveBeenCalledWith({ _id: id }, { $set: { title: "New" }, $unset: { internalPreviewId: "" } });
    });

    test("returns the result of the update", async () => {
        const result = { acknowledged: true, matchedCount: 1 };

        expect(await applyPostUpdateOperation(async () => result as never, new ObjectId().toString(), {})).toBe(result as never);
    });

    test("throws for a post id that is not an ObjectId, without updating", async () => {
        const updateOne = mock(async () => ({}) as never);

        expect(() => applyPostUpdateOperation(updateOne, "bogus", { title: "x" })).toThrow();
        expect(updateOne).not.toHaveBeenCalled();
    });
});
