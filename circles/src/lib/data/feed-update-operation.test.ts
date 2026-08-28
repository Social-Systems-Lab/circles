import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { Post } from "@/models/models";
import { ObjectId } from "mongodb";
import { applyPostUpdateOperation } from "./post-update-operation";

async function main() {
    const postId = new ObjectId().toHexString();
    let captured: unknown;
    await applyPostUpdateOperation(
        async (filter, operation) => {
            captured = { filter, operation };
            return { acknowledged: true, matchedCount: 1, modifiedCount: 1, upsertedCount: 0, upsertedId: null };
        },
        postId,
        {
            title: "Unrelated update",
            internalPreviewType: undefined,
            internalPreviewId: undefined,
            internalPreviewUrl: undefined,
            internalPreviewData: undefined,
        } as Partial<Post>,
    );

    assert.deepEqual(captured, {
        filter: { _id: new ObjectId(postId) },
        operation: {
            $set: { title: "Unrelated update" },
            $unset: {
                internalPreviewType: "",
                internalPreviewId: "",
                internalPreviewUrl: "",
                internalPreviewData: "",
            },
        },
    });

    const root = fileURLToPath(new URL("../../..", import.meta.url));
    const feedSource = await readFile(`${root}/src/lib/data/feed.ts`, "utf8");
    assert.match(feedSource, /applyPostUpdateOperation\(Posts\.updateOne\.bind\(Posts\), _id!, postWithoutId\)/);
    console.log("updatePost preview $unset operation test passed");
}

void main();
