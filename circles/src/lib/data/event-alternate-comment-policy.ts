import type { Comment, CommentDisplay, Event } from "@/models/models";
import { ObjectId } from "mongodb";
import { sanitizeCommentMentions } from "./comment-mention-policy";
import { getCommentDtosForAuthorizedPost } from "./authorized-comment-read";
import { resolveReadablePostContext, type ReadablePostContext } from "./post-access-policy";
import { canReadEventOwners } from "./post-source-access-policy";
import { assertCircleWritesAllowed } from "./circle-lifecycle-policy";
import { createCommentForAuthorizedPost, type CreateCommentDependencies } from "./discussion-comment-create";
import { toCommentDto } from "./comment-dto";
import {
    prepareAuthoredComment,
    type AuthoredCommentRequest,
    type SafeAuthoredCommentInput,
} from "./comment-write-policy";
import { isEventShadowBound } from "./event-shadow-binding-policy";

export { isEventShadowBound } from "./event-shadow-binding-policy";

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

export async function assertEventHostCirclesWritable(
    event: Pick<Event, "circleId" | "hostCircleIds">,
    assertWritable: (circleId: string) => Promise<void> = assertCircleWritesAllowed,
) {
    if (typeof event.circleId !== "string" || !ObjectId.isValid(event.circleId)) throw new Error("Event not found");
    if (event.hostCircleIds !== undefined && !Array.isArray(event.hostCircleIds)) throw new Error("Event not found");
    const hostIds = [event.circleId, ...(event.hostCircleIds ?? [])];
    if (hostIds.some((id) => typeof id !== "string" || !ObjectId.isValid(id))) throw new Error("Event not found");
    await Promise.all([...new Set(hostIds)].map(assertWritable));
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

export type AddEventCommentDependencies = {
    findEvent: (eventId: string, viewerDid: string) => Promise<Event | null>;
    resolvePost: (postId: string, viewerDid: string) => Promise<ReadablePostContext | null>;
    assertHostsWritable: (event: Pick<Event, "circleId" | "hostCircleIds">) => Promise<void>;
    authorizeComment: (viewerDid: string, circleId: string) => Promise<boolean>;
    createComment: (
        postId: string,
        data: SafeAuthoredCommentInput,
        createdBy: string,
        dependencies: CreateCommentDependencies,
    ) => Promise<Comment>;
    createDependencies: CreateCommentDependencies;
    prepareComment: typeof prepareAuthoredComment;
    findParentComment: (id: ObjectId) => Promise<Pick<Comment, "postId"> | null>;
    toCommentDto?: typeof toCommentDto;
    sanitizeComments: (comments: readonly CommentDisplay[], viewerDid?: string) => Promise<CommentDisplay[]>;
};

export async function addEventCommentWithDependencies(
    eventId: string,
    data: AuthoredCommentRequest,
    userDid: string,
    dependencies: AddEventCommentDependencies,
): Promise<CommentDisplay> {
    const unavailable = () => new Error("Event not found");
    const event = await dependencies.findEvent(eventId, userDid);
    if (!event?.commentPostId) throw unavailable();
    const context = await dependencies.resolvePost(event.commentPostId, userDid);
    if (!context || !isEventShadowBound(event, context)) throw unavailable();
    try {
        await dependencies.assertHostsWritable(event);
    } catch {
        throw unavailable();
    }
    if (!(await dependencies.authorizeComment(userDid, String(context.circle._id)))) {
        throw new Error("Not authorized to comment");
    }
    const prepared = await dependencies.prepareComment({
        postId: String(context.post._id),
        parentCommentId: data.parentCommentId,
        content: data.content!,
        writerDid: userDid,
        dependencies: { findParentComment: dependencies.findParentComment },
    });
    const inserted = await dependencies.createComment(
        String(context.post._id),
        prepared,
        userDid,
        dependencies.createDependencies,
    );
    const [sanitized] = await dependencies.sanitizeComments(
        [(dependencies.toCommentDto ?? toCommentDto)(inserted) as CommentDisplay],
        userDid,
    );
    return sanitized;
}
