"use server";

import { ObjectId } from "mongodb";
import { ChatMessage, ChatRoomDisplay, Circle } from "@/models/models";
import {
    createConversation,
    createMessage,
    deleteMessage,
    fetchMessagesSince,
    findConversationById,
    findOrCreateDmConversation,
    getUnreadCountsForUser,
    markConversationRead,
    toggleReaction,
    updateMessage,
} from "@/lib/data/mongo-chat";
import { ChatMessageDocs } from "@/lib/data/db";
import { getCircleByDid, getCircleById, getCirclesByDids } from "@/lib/data/circle";
import { saveFile } from "@/lib/data/storage";
import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import { features } from "@/lib/data/constants";
import { listChatRoomsForUser } from "@/lib/data/chat";

const resolveMongoConversationAccess = async (conversationId: string, userDid: string) => {
    const conversation = await findConversationById(conversationId);
    if (!conversation) {
        return { ok: false, message: "Chat not found" };
    }

    if (conversation.circleId) {
        const authorized = await isAuthorized(userDid, conversation.circleId, features.chat.view);
        if (!authorized) {
            return { ok: false, message: "You are not authorized to access this chat" };
        }
        return { ok: true, conversation };
    }

    if (!conversation.participants?.includes(userDid)) {
        return { ok: false, message: "You are not authorized to access this chat" };
    }

    return { ok: true, conversation };
};

export const listChatRoomsAction = async (): Promise<{ success: boolean; rooms?: ChatRoomDisplay[]; message?: string }> => {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "You need to be logged in to view chats" };
    }

    try {
        const rooms = await listChatRoomsForUser(userDid);
        const conversationIds = rooms.map((room) => room.matrixRoomId).filter(Boolean) as string[];
        const unreadCounts = await getUnreadCountsForUser(userDid, conversationIds);
        const roomsWithUnread = rooms.map((room) => ({
            ...room,
            unreadCount: room.matrixRoomId ? unreadCounts[room.matrixRoomId] || 0 : 0,
        }));
        return { success: true, rooms: roomsWithUnread };
    } catch (error) {
        console.error("❌ Error listing chat rooms:", error);
        return { success: false, message: error instanceof Error ? error.message : "Failed to load chats" };
    }
};

export const fetchMongoMessagesAction = async (
    conversationId: string,
    sinceId?: string,
    limit: number = 50,
): Promise<{ success: boolean; messages?: ChatMessage[]; nextSinceId?: string; message?: string }> => {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "You need to be logged in to fetch messages" };
    }

    const access = await resolveMongoConversationAccess(conversationId, userDid);
    if (!access.ok) {
        return { success: false, message: access.message };
    }

    try {
        const docs = await fetchMessagesSince(conversationId, sinceId, limit);
        if (!docs.length) {
            return { success: true, messages: [], nextSinceId: sinceId };
        }

        const senderDids = Array.from(new Set(docs.map((doc) => doc.senderDid)));
        const senders = senderDids.length ? await getCirclesByDids(senderDids) : [];
        const senderByDid = new Map(senders.map((circle) => [circle.did, circle]));

        const replyIds = Array.from(new Set(docs.map((doc) => doc.replyToMessageId).filter(Boolean) as string[]));
        const replyObjectIds = replyIds.map((id) => new ObjectId(id));
        const replyDocs = replyObjectIds.length
            ? ((await ChatMessageDocs.find({ _id: { $in: replyObjectIds } }).toArray()) as any[])
            : [];
        const replyById = new Map(
            replyDocs.map((reply) => [reply._id.toString(), { ...reply, _id: reply._id.toString() }]),
        );

        const messages = docs.map((doc) => {
            const author =
                senderByDid.get(doc.senderDid) ||
                ({
                    _id: doc.senderDid,
                    name: doc.senderDid,
                    picture: { url: "/placeholder.svg" },
                } as Circle);

            const replyDoc = doc.replyToMessageId ? replyById.get(doc.replyToMessageId) : undefined;
            const replyAuthor = replyDoc
                ? senderByDid.get(replyDoc.senderDid) ||
                  ({
                      _id: replyDoc.senderDid,
                      name: replyDoc.senderDid,
                      picture: { url: "/placeholder.svg" },
                  } as Circle)
                : undefined;

            const reactions = (doc.reactions || []).reduce((acc: Record<string, any[]>, reaction) => {
                if (!acc[reaction.emoji]) {
                    acc[reaction.emoji] = [];
                }
                acc[reaction.emoji].push({
                    sender: reaction.userDid,
                    eventId: `${doc._id}:${reaction.userDid}:${reaction.emoji}`,
                });
                return acc;
            }, {});

            const message: ChatMessage = {
                id: doc._id as string,
                roomId: conversationId,
                type: "m.room.message",
                content: {
                    msgtype: "m.text",
                    body: doc.body,
                },
                createdBy: doc.senderDid,
                createdAt: doc.createdAt,
                author,
                reactions,
                replyTo: replyDoc
                    ? {
                          id: replyDoc._id,
                          author: replyAuthor,
                          content: {
                              msgtype: "m.text",
                              body: replyDoc.body,
                          },
                      }
                    : undefined,
            };

            (message as any).attachments = doc.attachments;
            (message as any).editedAt = doc.editedAt;
            (message as any).format = doc.format;

            return message;
        });

        return { success: true, messages, nextSinceId: docs[docs.length - 1]._id as string };
    } catch (error) {
        console.error("❌ Error fetching mongo messages:", error);
        return { success: false, message: error instanceof Error ? error.message : "Failed to fetch messages" };
    }
};

export const sendMongoMessageAction = async (
    conversationId: string,
    content: string,
    replyToMessageId?: string,
    format?: "markdown",
): Promise<{ success: boolean; messageId?: string; message?: string }> => {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "You need to be logged in to send messages" };
    }

    const access = await resolveMongoConversationAccess(conversationId, userDid);
    if (!access.ok) {
        return { success: false, message: access.message };
    }

    try {
        const doc = await createMessage({
            conversationId,
            senderDid: userDid,
            body: content,
            createdAt: new Date(),
            replyToMessageId,
            format,
        });
        return { success: true, messageId: doc._id as string };
    } catch (error) {
        console.error("❌ Error sending mongo message:", error);
        return { success: false, message: error instanceof Error ? error.message : "Failed to send message" };
    }
};

export const sendMongoAttachmentAction = async (
    formData: FormData,
): Promise<{ success: boolean; messageId?: string; message?: string }> => {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "You need to be logged in to send attachments" };
    }

    const conversationId = formData.get("roomId") as string;
    const file = formData.get("file") as File;
    const replyToMessageId =
        (formData.get("replyToMessageId") as string | undefined) ||
        (formData.get("replyToEventId") as string | undefined);

    if (!conversationId || !file) {
        return { success: false, message: "Missing room ID or file" };
    }

    const MAX_SIZE = 5 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
        return { success: false, message: "File size exceeds 5MB limit" };
    }

    const access = await resolveMongoConversationAccess(conversationId, userDid);
    if (!access.ok) {
        return { success: false, message: access.message };
    }

    try {
        const ownerCircle = access.conversation?.circleId
            ? await getCircleById(access.conversation.circleId)
            : await getCircleByDid(userDid);
        if (!ownerCircle?._id) {
            return { success: false, message: "Could not resolve storage owner" };
        }

        const fileInfo = await saveFile(file, "chat-attachment", ownerCircle._id as string, true);
        const attachment = {
            url: fileInfo.url,
            key: fileInfo.fileName,
            name: fileInfo.originalName || file.name,
            mimeType: file.type,
            size: file.size,
        };

        const doc = await createMessage({
            conversationId,
            senderDid: userDid,
            body: file.name,
            createdAt: new Date(),
            replyToMessageId,
            attachments: [attachment],
        });

        return { success: true, messageId: doc._id as string };
    } catch (error) {
        console.error("❌ Error sending mongo attachment:", error);
        return { success: false, message: error instanceof Error ? error.message : "Failed to send attachment" };
    }
};

export const editMongoMessageAction = async (
    messageId: string,
    content: string,
): Promise<{ success: boolean; message?: string }> => {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "You need to be logged in to edit messages" };
    }

    const updated = await updateMessage(messageId, userDid, content);
    return updated ? { success: true } : { success: false, message: "Failed to edit message" };
};

export const deleteMongoMessageAction = async (
    messageId: string,
): Promise<{ success: boolean; message?: string }> => {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "You need to be logged in to delete messages" };
    }

    const deleted = await deleteMessage(messageId, userDid);
    return deleted ? { success: true } : { success: false, message: "Failed to delete message" };
};

export const toggleMongoReactionAction = async (
    messageId: string,
    emoji: string,
): Promise<{ success: boolean; reactions?: ChatMessage["reactions"]; message?: string }> => {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "You need to be logged in to react" };
    }

    const reactions = await toggleReaction(messageId, userDid, emoji);
    if (!reactions) {
        return { success: false, message: "Failed to update reaction" };
    }

    const reactionMap = reactions.reduce((acc: Record<string, any[]>, reaction) => {
        if (!acc[reaction.emoji]) {
            acc[reaction.emoji] = [];
        }
        acc[reaction.emoji].push({
            sender: reaction.userDid,
            eventId: `${messageId}:${reaction.userDid}:${reaction.emoji}`,
        });
        return acc;
    }, {});

    return { success: true, reactions: reactionMap };
};

export const findOrCreateDMConversationAction = async (
    inRecipient: Circle,
): Promise<{ success: boolean; message?: string; chatRoom?: ChatRoomDisplay }> => {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "You need to be logged in to send PM" };
    }

    const recipient = inRecipient?.did ? await getCircleByDid(inRecipient.did) : undefined;
    if (!recipient) {
        return { success: false, message: "Could not find recipient" };
    }

    const currentUser = await getCircleByDid(userDid);
    if (!currentUser || currentUser._id === recipient._id) {
        return { success: false, message: "You cannot send a message to yourself" };
    }

    await findOrCreateDmConversation(currentUser, recipient);
    const rooms = await listChatRoomsForUser(userDid);
    const chatRoom = rooms.find((room) => room.handle === recipient.handle);

    return chatRoom
        ? { success: true, chatRoom }
        : { success: false, message: "Failed to create DM room" };
};

export const createMongoGroupChatAction = async (
    formData: FormData,
): Promise<{ success: boolean; roomId?: string; message?: string }> => {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "You need to be logged in to create a group chat" };
    }

    const name = formData.get("name") as string;
    const participantDidsJson = formData.get("participants") as string;

    if (!name || !participantDidsJson) {
        return { success: false, message: "Missing group name or participants" };
    }

    let participantDids: string[] = [];
    try {
        participantDids = JSON.parse(participantDidsJson);
    } catch {
        return { success: false, message: "Invalid participants data" };
    }

    const participants = Array.from(new Set([userDid, ...participantDids])).filter(Boolean);
    const handle = name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");

    try {
        const conversation = await createConversation({
            type: "group",
            name,
            handle: handle || `group-${Date.now()}`,
            participants,
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        return { success: true, roomId: conversation._id as string };
    } catch (error) {
        console.error("❌ Error creating mongo group chat:", error);
        return { success: false, message: error instanceof Error ? error.message : "Failed to create group chat" };
    }
};

export const getUnreadCountsAction = async (
    conversationIds: string[],
): Promise<{ success: boolean; counts?: Record<string, number>; message?: string }> => {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "You need to be logged in to view unread counts" };
    }

    try {
        const counts = await getUnreadCountsForUser(userDid, conversationIds);
        return { success: true, counts };
    } catch (error) {
        console.error("❌ Error fetching unread counts:", error);
        return { success: false, message: error instanceof Error ? error.message : "Failed to fetch unread counts" };
    }
};

export const markConversationReadAction = async (
    conversationId: string,
    lastSeenMessageId: string | null,
): Promise<{ success: boolean; message?: string }> => {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "You need to be logged in to mark messages as read" };
    }

    try {
        await markConversationRead(userDid, conversationId, lastSeenMessageId);
        return { success: true };
    } catch (error) {
        console.error("❌ Error marking conversation read:", error);
        return { success: false, message: error instanceof Error ? error.message : "Failed to mark conversation read" };
    }
};
