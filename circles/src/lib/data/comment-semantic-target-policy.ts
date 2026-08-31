import { ObjectId } from "mongodb";
import type { Event, Feature, Goal, Issue, Proposal, Task } from "@/models/models";
import { features, getPostCommentFeature } from "./constants";
import type { ReadablePostContext } from "./post-access-policy";

export type CommentDetailSource = Task | Goal | Issue | Proposal;
export type CommentSourceType = "task" | "goal" | "issue" | "proposal" | "event";
export type CommentSemanticRoute =
    | { kind: "generic" }
    | { kind: "discussion" }
    | { kind: "event"; eventId: string; event: Event };

export type CommentSemanticTarget = {
    commentFeature: Feature;
    route: CommentSemanticRoute;
};

export const normalizeCommentTargetId = (value: unknown): string | null => {
    const candidate = value instanceof ObjectId || typeof value === "string" ? String(value) : null;
    return candidate && ObjectId.isValid(candidate) ? new ObjectId(candidate).toHexString() : null;
};

const detailFeatures = {
    task: features.tasks.comment,
    goal: features.goals.comment,
    issue: features.issues.comment,
    proposal: features.feed.comment,
} as const;

/** Classifies a readable Post without weakening strict detail-shadow backlinks. */
export async function resolveCommentSemanticTarget(
    context: ReadablePostContext,
    normalizedPostId: string,
    findSource: (type: CommentSourceType, id: ObjectId) => Promise<CommentDetailSource | Event | null>,
): Promise<CommentSemanticTarget | null> {
    let route: CommentSemanticRoute = { kind: "generic" };
    let commentFeature = getPostCommentFeature(context.post.postType);

    // `event` is reserved for the alternate Event Comment shadow and must never
    // degrade to an ordinary feed target when its canonical Event marker is absent.
    if (context.post.postType === "event" && context.post.parentItemType !== "event") return null;

    if (context.post.postType === "discussion" && context.post.parentItemType !== "event") {
        route = { kind: "discussion" };
        commentFeature = features.discussions.comment;
    } else if (context.post.parentItemType === "event") {
        const eventId = normalizeCommentTargetId(context.post.parentItemId);
        const isAlternate = context.post.postType === "event" || context.post.postType === "discussion";
        if (isAlternate) {
            if (!eventId) return null;
            const event = (await findSource("event", new ObjectId(eventId))) as Event | null;
            if (
                !event ||
                normalizeCommentTargetId(event._id) !== eventId ||
                normalizeCommentTargetId(event.commentPostId) !== normalizedPostId
            ) {
                return null;
            }
            route = { kind: "event", eventId, event };
            commentFeature = features.feed.comment;
        } else if (context.post.postType !== "post") {
            return null;
        }
    } else if (
        context.post.parentItemType &&
        ["task", "goal", "issue", "proposal"].includes(context.post.parentItemType) &&
        context.post.postType === context.post.parentItemType
    ) {
        const type = context.post.parentItemType as keyof typeof detailFeatures;
        const sourceId = normalizeCommentTargetId(context.post.parentItemId);
        if (!sourceId) return null;
        const source = await findSource(type, new ObjectId(sourceId));
        if (
            !source ||
            normalizeCommentTargetId(source._id) !== sourceId ||
            normalizeCommentTargetId(source.commentPostId) !== normalizedPostId
        ) {
            return null;
        }
        commentFeature = detailFeatures[type];
    }

    return commentFeature ? { commentFeature, route } : null;
}
