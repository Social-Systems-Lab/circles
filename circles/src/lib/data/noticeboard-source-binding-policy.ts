import { ObjectId } from "mongodb";

type CanonicalId = unknown;

export type ShiftNoticeboardPostBinding = {
    _id?: CanonicalId;
    feedId?: CanonicalId;
    postType?: unknown;
    internalPreviewType?: unknown;
    internalPreviewId?: CanonicalId;
};

export type ShiftNoticeboardFeedBinding = {
    _id?: CanonicalId;
    handle?: unknown;
    circleId?: CanonicalId;
};

export const normalizeCanonicalObjectId = (value: CanonicalId): string | null => {
    if (value === null || value === undefined) return null;
    try {
        const candidate = typeof value === "string" ? value : value instanceof ObjectId ? value.toHexString() : null;
        return candidate && /^[a-f\d]{24}$/i.test(candidate) ? candidate.toLowerCase() : null;
    } catch {
        return null;
    }
};

export const isShiftNoticeboardBound = ({
    storedNoticeboardPostId,
    post,
    feed,
    expectedTaskId,
    expectedCircleId,
}: {
    storedNoticeboardPostId: CanonicalId;
    post: ShiftNoticeboardPostBinding | null;
    feed: ShiftNoticeboardFeedBinding | null;
    expectedTaskId: CanonicalId;
    expectedCircleId: CanonicalId;
}): boolean => {
    const storedPostId = normalizeCanonicalObjectId(storedNoticeboardPostId);
    const postId = normalizeCanonicalObjectId(post?._id);
    const postFeedId = normalizeCanonicalObjectId(post?.feedId);
    const feedId = normalizeCanonicalObjectId(feed?._id);
    const feedCircleId = normalizeCanonicalObjectId(feed?.circleId);
    const taskId = normalizeCanonicalObjectId(expectedTaskId);
    const circleId = normalizeCanonicalObjectId(expectedCircleId);
    const previewTaskId = normalizeCanonicalObjectId(post?.internalPreviewId);

    return Boolean(
        storedPostId &&
            postId === storedPostId &&
            postFeedId &&
            feedId === postFeedId &&
            feedCircleId &&
            feedCircleId === circleId &&
            taskId &&
            previewTaskId === taskId &&
            feed?.handle === "default" &&
            post?.postType === "post" &&
            post?.internalPreviewType === "task",
    );
};
