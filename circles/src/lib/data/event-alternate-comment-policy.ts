import type { CommentDisplay, Event } from "@/models/models";
import { ObjectId } from "mongodb";
import { sanitizeCommentMentions } from "./comment-mention-policy";
import { getCommentDtosForAuthorizedPost } from "./authorized-comment-read";
import { resolveReadablePostContext, type ReadablePostContext } from "./post-access-policy";
import { canReadEventOwners } from "./post-source-access-policy";

type EventCommentReadDependencies = {
    canReadOwners: (event: Pick<Event, "circleId" | "hostCircleIds">, viewerDid?: string) => Promise<boolean>;
    resolvePost: (postId: string, viewerDid?: string) => Promise<ReadablePostContext | null>;
    loadComments: (postId: string) => Promise<CommentDisplay[]>;
    sanitizeComments: (comments: readonly CommentDisplay[], viewerDid?: string) => Promise<CommentDisplay[]>;
};

const defaultDependencies: EventCommentReadDependencies = {
    canReadOwners: canReadEventOwners,
    resolvePost: resolveReadablePostContext,
    loadComments: getCommentDtosForAuthorizedPost,
    sanitizeComments: sanitizeCommentMentions,
};

const sameId = (left: unknown, right: unknown): boolean =>
    (typeof left === "string" || left instanceof ObjectId) &&
    (typeof right === "string" || right instanceof ObjectId) &&
    String(left) === String(right);

export function isEventShadowBound(
    event: Pick<Event, "_id" | "circleId" | "commentPostId">,
    context: ReadablePostContext,
) {
    const { post, feed, circle } = context;
    return (
        sameId(post._id, event.commentPostId) &&
        post.parentItemType === "event" &&
        sameId(post.parentItemId, event._id) &&
        sameId(post.feedId, feed._id) &&
        sameId(feed.circleId, circle._id) &&
        sameId(circle._id, event.circleId) &&
        (post.postType === "event" || post.postType === "discussion")
    );
}

/** Returns null for every denied or unavailable Event/shadow state. */
export async function getReadableEventCommentDtos(
    event: Pick<Event, "_id" | "circleId" | "hostCircleIds" | "commentPostId">,
    viewerDid?: string,
    dependencies: EventCommentReadDependencies = defaultDependencies,
): Promise<CommentDisplay[] | null> {
    if (!event.commentPostId) {
        return (await dependencies.canReadOwners(event, viewerDid)) ? [] : null;
    }

    const context = await dependencies.resolvePost(event.commentPostId, viewerDid);
    if (!context || !isEventShadowBound(event, context)) return null;

    const comments = await dependencies.loadComments(event.commentPostId);
    return dependencies.sanitizeComments(comments, viewerDid);
}
