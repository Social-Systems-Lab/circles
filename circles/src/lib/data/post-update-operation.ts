import type { Post } from "@/models/models";
import { ObjectId, type UpdateResult } from "mongodb";

export const buildPostUpdateOperation = (postWithoutId: Partial<Post>) => {
    const mutablePost = postWithoutId as Record<string, unknown>;
    const previewFields = [
        "internalPreviewType",
        "internalPreviewId",
        "internalPreviewUrl",
        "internalPreviewData",
    ] as const;
    const unsetPreviewFields = previewFields.filter(
        (field) => Object.prototype.hasOwnProperty.call(mutablePost, field) && mutablePost[field] === undefined,
    );
    if (unsetPreviewFields.length) {
        for (const field of unsetPreviewFields) delete mutablePost[field];
    }
    return unsetPreviewFields.length
        ? { $set: postWithoutId, $unset: Object.fromEntries(unsetPreviewFields.map((field) => [field, ""])) }
        : { $set: postWithoutId };
};

export const applyPostUpdateOperation = (
    updateOne: (
        filter: { _id: ObjectId },
        operation: ReturnType<typeof buildPostUpdateOperation>,
    ) => Promise<UpdateResult>,
    postId: string,
    postWithoutId: Partial<Post>,
) => updateOne({ _id: new ObjectId(postId) }, buildPostUpdateOperation(postWithoutId));
