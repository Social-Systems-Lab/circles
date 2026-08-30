import { ObjectId } from "mongodb";
import type { Event } from "@/models/models";
import type { ReadablePostContext } from "./post-access-policy";

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
