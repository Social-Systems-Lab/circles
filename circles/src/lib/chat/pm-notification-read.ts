import { ObjectId } from "mongodb";
import { ChatMessageDocs, Notifications } from "@/lib/data/db";
import { buildMessagesAtOrBeforePositionQuery } from "./message-position-query";
import { normalizeObjectIdHex } from "./topic-read-state";

export const acknowledgeTopicPmNotifications = async ({
    userDid,
    conversationId,
    topicId,
    lastReadMessageId,
}: {
    userDid: string;
    conversationId: string;
    topicId: string;
    lastReadMessageId: string;
}): Promise<number> => {
    const normalizedTopicId = normalizeObjectIdHex(topicId);
    const normalizedBoundaryId = normalizeObjectIdHex(lastReadMessageId);
    if (!normalizedTopicId || !normalizedBoundaryId) throw new Error("Invalid PM notification read boundary");

    const topicObjectId = new ObjectId(normalizedTopicId);
    const boundaryObjectId = new ObjectId(normalizedBoundaryId);
    const boundary = await ChatMessageDocs.findOne(
        {
            _id: boundaryObjectId,
            conversationId,
            $or: [{ _id: topicObjectId, thread: { $exists: true } }, { threadId: normalizedTopicId }],
        },
        { projection: { _id: 1, createdAt: 1 } },
    );
    if (!boundary) throw new Error("PM notification read boundary does not belong to the topic");

    const eligibleMessages = await ChatMessageDocs.find(
        {
            conversationId,
            $and: [
                {
                    $or: [{ _id: topicObjectId, thread: { $exists: true } }, { threadId: normalizedTopicId }],
                },
                buildMessagesAtOrBeforePositionQuery({
                    id: normalizedBoundaryId,
                    createdAt: boundary.createdAt,
                }),
            ],
        },
        { projection: { _id: 1 } },
    ).toArray();
    if (!eligibleMessages.length) return 0;

    const result = await Notifications.updateMany(
        {
            userId: userDid,
            type: "pm_received",
            isRead: false,
            "content.roomId": conversationId,
            "content.topicId": normalizedTopicId,
            "content.messageId": { $in: eligibleMessages.map((message) => message._id.toString()) },
        },
        { $set: { isRead: true } },
    );
    return result.modifiedCount;
};
