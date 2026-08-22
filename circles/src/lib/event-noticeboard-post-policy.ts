import type { Event, Post } from "@/models/models";

export function buildEventNoticeboardPostData({
    event,
    feedId,
    internalPreviewUrl,
}: {
    event: Pick<Event, "_id" | "title" | "description" | "createdBy">;
    feedId: string;
    internalPreviewUrl: string;
}): Partial<Post> | null {
    const eventId = event._id?.toString();
    if (!eventId) return null;
    const description = event.description.trim();
    return {
        title: event.title,
        content: description ? `Attend this event. ${description}` : "Attend this event.",
        feedId,
        createdBy: event.createdBy,
        createdAt: new Date(),
        editedAt: new Date(),
        reactions: {},
        comments: 0,
        userGroups: ["admins", "moderators", "members"],
        postType: "post",
        internalPreviewType: "event",
        internalPreviewId: eventId,
        internalPreviewUrl,
        parentItemType: "event",
        parentItemId: eventId,
    };
}
