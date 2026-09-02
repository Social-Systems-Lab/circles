import { ObjectId } from "mongodb";
import {
    isShiftNoticeboardBound,
    normalizeCanonicalObjectId,
    ShiftNoticeboardFeedBinding,
    ShiftNoticeboardPostBinding,
} from "./noticeboard-source-binding-policy";

export const NOTICEBOARD_UNAVAILABLE_MESSAGE = "Noticeboard unavailable.";

export type ValidatedShiftNoticeboardBinding = {
    postId: string;
};

export const resolveShiftNoticeboardBinding = async ({
    storedNoticeboardPostId,
    expectedTaskId,
    expectedCircleId,
    findPostById,
    findFeedById,
}: {
    storedNoticeboardPostId: unknown;
    expectedTaskId: unknown;
    expectedCircleId: unknown;
    findPostById: (id: ObjectId) => Promise<ShiftNoticeboardPostBinding | null>;
    findFeedById: (id: ObjectId) => Promise<ShiftNoticeboardFeedBinding | null>;
}): Promise<ValidatedShiftNoticeboardBinding | null> => {
    const postId = normalizeCanonicalObjectId(storedNoticeboardPostId);
    if (!postId) return null;

    const post = await findPostById(new ObjectId(postId));
    const feedId = normalizeCanonicalObjectId(post?.feedId);
    if (!post || !feedId) return null;

    const feed = await findFeedById(new ObjectId(feedId));
    if (
        !isShiftNoticeboardBound({
            storedNoticeboardPostId: postId,
            post,
            feed,
            expectedTaskId,
            expectedCircleId,
        })
    ) {
        return null;
    }

    return { postId };
};
