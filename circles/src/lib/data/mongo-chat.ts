import { ObjectId } from "mongodb";
import { ChatRoomDisplay, Circle } from "@/models/models";
import { ChatConversation, ChatMessageDoc, ChatReaction } from "@/lib/chat/mongo-types";
import { ChatConversations, ChatMessageDocs } from "./db";
import { getCircleByHandle, getCircleById, getCirclesByDids } from "./circle";

const toObjectId = (value?: string | null) => {
    if (!value) return null;
    try {
        return new ObjectId(value);
    } catch {
        return null;
    }
};

const normalizeConversation = (conversation: ChatConversation) => {
    if (conversation?._id) {
        conversation._id = conversation._id.toString();
    }
    return conversation;
};

export const createConversation = async (conversation: ChatConversation): Promise<ChatConversation> => {
    const result = await ChatConversations.insertOne(conversation);
    return normalizeConversation({ ...conversation, _id: result.insertedId.toString() });
};

export const findConversationById = async (conversationId: string): Promise<ChatConversation | null> => {
    const objectId = toObjectId(conversationId);
    if (!objectId) return null;
    const conversation = (await ChatConversations.findOne({ _id: objectId })) as ChatConversation | null;
    return conversation ? normalizeConversation(conversation) : null;
};

export const findConversationByCircleId = async (circleId: string): Promise<ChatConversation | null> => {
    const conversation = (await ChatConversations.findOne({
        circleId,
        type: "group",
        archived: { $ne: true },
    })) as ChatConversation | null;
    return conversation ? normalizeConversation(conversation) : null;
};

export const findConversationByHandleForUser = async (
    userDid: string,
    handle: string,
): Promise<ChatConversation | null> => {
    const circle = await getCircleByHandle(handle);
    if (circle?._id) {
        const circleConversation = await findConversationByCircleId(circle._id as string);
        if (circleConversation) {
            return circleConversation;
        }
    }

    const conversation = (await ChatConversations.findOne({
        handle,
        participants: userDid,
        archived: { $ne: true },
    })) as ChatConversation | null;
    return conversation ? normalizeConversation(conversation) : null;
};

export const findOrCreateDmConversation = async (userA: Circle, userB: Circle): Promise<ChatConversation> => {
    const participants = [userA.did!, userB.did!].sort();
    const existing = (await ChatConversations.findOne({
        type: "dm",
        participants: { $all: participants },
        archived: { $ne: true },
    })) as ChatConversation | null;

    if (existing) {
        return normalizeConversation(existing);
    }

    const handle = `dm-${participants[0]}-${participants[1]}`;
    return createConversation({
        type: "dm",
        name: handle,
        handle,
        participants,
        createdAt: new Date(),
        updatedAt: new Date(),
    });
};

export const ensureConversationForCircle = async (circleId: string): Promise<ChatConversation> => {
    const existing = await findConversationByCircleId(circleId);
    if (existing) return existing;

    return createConversation({
        type: "group",
        circleId,
        participants: [],
        createdAt: new Date(),
        updatedAt: new Date(),
    });
};

export const listConversationsForUser = async (userDid: string, circleIds: string[]): Promise<ChatRoomDisplay[]> => {
    const circleConversationIds: string[] = [];
    for (const circleId of circleIds) {
        const conversation = await ensureConversationForCircle(circleId);
        circleConversationIds.push(conversation._id as string);
    }

    const conversations = (await ChatConversations.find({
        $or: [{ participants: userDid }, { _id: { $in: circleConversationIds.map((id) => new ObjectId(id)) } }],
        archived: { $ne: true },
    }).toArray()) as ChatConversation[];

    const normalized = conversations.map(normalizeConversation);
    const participantDids = Array.from(
        new Set(normalized.flatMap((conversation) => conversation.participants || [])),
    );
    const circles = participantDids.length ? await getCirclesByDids(participantDids) : [];
    const circleByDid = new Map(circles.map((circle) => [circle.did, circle]));

    const circleIdsToLoad = Array.from(
        new Set(normalized.map((conversation) => conversation.circleId).filter(Boolean) as string[]),
    );
    const circleById = new Map<string, Circle>();
    for (const id of circleIdsToLoad) {
        const circle = await getCircleById(id);
        if (circle) {
            circleById.set(id, circle);
        }
    }

    return normalized.map((conversation) => {
        const isDirect = conversation.type === "dm";
        const circle = conversation.circleId ? circleById.get(conversation.circleId) : undefined;
        const otherDid = isDirect
            ? conversation.participants.find((participant) => participant !== userDid)
            : undefined;
        const otherCircle = otherDid ? circleByDid.get(otherDid) : undefined;
        const dmParticipants = isDirect
            ? conversation.participants
                  .map((did) => circleByDid.get(did)?._id)
                  .filter(Boolean)
                  .map((id) => id as string)
            : undefined;

        return {
            _id: conversation._id,
            matrixRoomId: conversation._id,
            name: circle?.name || otherCircle?.name || conversation.name || "Chat",
            handle: circle?.handle || otherCircle?.handle || conversation.handle || "chat",
            circleId: conversation.circleId,
            createdAt: conversation.createdAt,
            userGroups: [],
            picture: circle?.picture || otherCircle?.picture,
            isDirect,
            dmParticipants,
            circle,
        } as ChatRoomDisplay;
    });
};

export const fetchMessagesSince = async (
    conversationId: string,
    sinceId?: string,
    limit: number = 50,
): Promise<ChatMessageDoc[]> => {
    const query: any = { conversationId };
    const sinceObjectId = toObjectId(sinceId);
    if (sinceObjectId) {
        query._id = { $gt: sinceObjectId };
    }

    const messages = (await ChatMessageDocs.find(query)
        .sort({ _id: 1 })
        .limit(limit)
        .toArray()) as ChatMessageDoc[];

    return messages.map((message) => {
        if (message._id) {
            message._id = message._id.toString();
        }
        return message;
    });
};

export const createMessage = async (message: ChatMessageDoc): Promise<ChatMessageDoc> => {
    const result = await ChatMessageDocs.insertOne(message);
    return { ...message, _id: result.insertedId.toString() };
};

export const updateMessage = async (
    messageId: string,
    userDid: string,
    body: string,
): Promise<boolean> => {
    const objectId = toObjectId(messageId);
    if (!objectId) return false;
    const result = await ChatMessageDocs.updateOne(
        { _id: objectId, senderDid: userDid },
        { $set: { body, editedAt: new Date() } },
    );
    return result.matchedCount > 0;
};

export const deleteMessage = async (messageId: string, userDid: string): Promise<boolean> => {
    const objectId = toObjectId(messageId);
    if (!objectId) return false;
    const result = await ChatMessageDocs.deleteOne({ _id: objectId, senderDid: userDid });
    return result.deletedCount > 0;
};

export const toggleReaction = async (
    messageId: string,
    userDid: string,
    emoji: string,
): Promise<ChatReaction[] | null> => {
    const objectId = toObjectId(messageId);
    if (!objectId) return null;
    const message = (await ChatMessageDocs.findOne({ _id: objectId })) as ChatMessageDoc | null;
    if (!message) return null;

    const reactions = message.reactions ? [...message.reactions] : [];
    const existingIndex = reactions.findIndex((reaction) => reaction.userDid === userDid && reaction.emoji === emoji);

    if (existingIndex >= 0) {
        reactions.splice(existingIndex, 1);
    } else {
        reactions.push({ emoji, userDid, createdAt: new Date() });
    }

    await ChatMessageDocs.updateOne({ _id: objectId }, { $set: { reactions } });
    return reactions;
};
