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
    listConversationsForUser,
    mapConversationToChatRoomDisplay,
    markConversationRead,
    toggleReaction,
    updateMessage,
} from "@/lib/data/mongo-chat";
import { ChatConversations, ChatMessageDocs, ChatRoomMembers, ChatRooms, Circles, Members } from "@/lib/data/db";
import { getCircleByDid, getCircleByHandle, getCircleById, getCirclesByDids } from "@/lib/data/circle";
import { saveFile } from "@/lib/data/storage";
import { getAuthenticatedUserDid } from "@/lib/auth/auth";
import { WELCOME_MESSAGE, isSystemMessageSource } from "@/config/welcome-message";
import { normalizeSystemMessageMetadata } from "@/lib/chat/system-messages";
import { skillsV2 } from "@/lib/data/skills-v2";

const normalizeMediaUrl = (url?: string): string | undefined => {
    if (!url) return url;

    if (url.startsWith("/storage/") || url.startsWith("/uploads/")) {
        return url;
    }

    const storageIndex = url.indexOf("/storage/");
    if (storageIndex >= 0) {
        return url.slice(storageIndex);
    }

    const hostStyleMatch = url.match(/^[A-Za-z0-9.-]+\/storage\/.+$/);
    if (hostStyleMatch) {
        return `/${url.slice(url.indexOf("storage/"))}`;
    }

    return url;
};

const CIRCLE_CONTACT_SOURCE = "circle_contact";
const CIRCLE_CONTACT_VERSION = "v1";
const skillNameByHandle = new Map(skillsV2.map((skill) => [skill.handle, skill.name]));

const sanitizeHandleSegment = (value: string): string =>
    value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");

const buildCircleContactHandle = (circleId: string, requesterDid: string): string => {
    const safeRequester = sanitizeHandleSegment(requesterDid) || "member";
    return `contact-circle-${circleId}-${safeRequester}`;
};

const isActiveGroupMembership = (membership: any): boolean => {
    if (!membership) return false;

    const membershipStatus = typeof membership.status === "string" ? membership.status.toLowerCase() : undefined;
    if (membershipStatus === "removed" || membershipStatus === "left" || membershipStatus === "inactive") return false;
    if (membershipStatus && membershipStatus !== "active") return false;
    if ((membership as any).active === false || (membership as any).isActive === false) return false;

    return true;
};

const buildChatRoomMembershipFilter = (userDid: string, conversationId: string): any => {
    if (ObjectId.isValid(conversationId)) {
        return {
            userDid,
            $or: [{ chatRoomId: conversationId }, { chatRoomId: new ObjectId(conversationId) }],
        };
    }

    return { userDid, chatRoomId: conversationId };
};

const getSystemTemplateAuthor = (conversationMetadata?: Record<string, unknown>): Circle =>
    ({
        _id: `system:${
            (typeof conversationMetadata?.senderHandle === "string" && conversationMetadata.senderHandle) ||
            WELCOME_MESSAGE.senderHandle
        }`,
        did: `system:${
            (typeof conversationMetadata?.senderHandle === "string" && conversationMetadata.senderHandle) ||
            WELCOME_MESSAGE.senderHandle
        }`,
        handle:
            (typeof conversationMetadata?.senderHandle === "string" && conversationMetadata.senderHandle) ||
            WELCOME_MESSAGE.senderHandle,
        name:
            (typeof conversationMetadata?.senderName === "string" && conversationMetadata.senderName) ||
            WELCOME_MESSAGE.displayName,
        picture: {
            url:
                (typeof conversationMetadata?.senderAvatarUrl === "string" && conversationMetadata.senderAvatarUrl) ||
                WELCOME_MESSAGE.avatarUrl,
        },
        circleType: "user",
    } as Circle);

export const resolveMongoConversationAccess = async (conversationId: string, userDid: string) => {
    let conversation = await findConversationById(conversationId);

    // If conversationId is actually a handle (e.g. "dm-..."), try resolving by handle.
    if (!conversation) {
        const { ChatConversations } = await import("@/lib/data/db");
        conversation = await ChatConversations.findOne({ handle: conversationId });
    }

    if (!conversation) {
        return { ok: false, message: "Chat not found" };
    }

    const unauthorized = { ok: false as const, message: "You are not authorized to access this chat" };

    // DM + announcement: authorize strictly by participants list
    if (conversation.type === "dm" || conversation.type === "announcement") {
        if (!conversation.participants?.includes(userDid)) return unauthorized;
        return { ok: true, conversation };
    }

    // Non-DM: enforce strict membership in ChatRoomMembers
    const chatRoomId = String((conversation as any)._id);
    const membershipQuery: any = { userDid, chatRoomId };
    // Handle both string and ObjectId-stored chatRoomId values
    if (ObjectId.isValid(chatRoomId)) {
        membershipQuery.$or = [{ userDid, chatRoomId }, { userDid, chatRoomId: new ObjectId(chatRoomId) }];
        delete membershipQuery.chatRoomId;
    }

    const membership: any = await ChatRoomMembers.findOne(membershipQuery);
    if (!membership) return unauthorized;

    if (!isActiveGroupMembership(membership)) return unauthorized;

    return { ok: true, conversation };
};

const validateReplyTargetForConversation = async (
    conversationId: string,
    replyToMessageId?: string,
): Promise<{ ok: boolean; message?: string }> => {
    if (!replyToMessageId) {
        return { ok: true };
    }

    if (!ObjectId.isValid(replyToMessageId)) {
        return { ok: true };
    }

    const replyTargetDoc = await ChatMessageDocs.findOne(
        {
            _id: new ObjectId(replyToMessageId),
            conversationId,
        },
        {
            projection: { source: 1, version: 1, system: 1 },
        },
    );

    if (!replyTargetDoc) {
        return { ok: false, message: "Reply target not found" };
    }

    const replyTargetSystemMetadata = normalizeSystemMessageMetadata({
        source: replyTargetDoc.source,
        version: replyTargetDoc.version,
        system: (replyTargetDoc as any).system,
    });

    if (replyTargetSystemMetadata.messageType === "system" && replyTargetSystemMetadata.repliesDisabled === true) {
        return { ok: false, message: "Replies are disabled for this announcement" };
    }

    return { ok: true };
};

export const listChatRoomsAction = async (): Promise<{ success: boolean; rooms?: ChatRoomDisplay[]; message?: string }> => {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "You need to be logged in to view chats" };
    }

    try {
        // Why this broke: delegating through listChatRoomsForUser used provider branching.
        // A provider mismatch could hide Mongo DMs in production.
        const memberRows = await Members.find({ userDid }).toArray();
        const circleIds = memberRows.map((membership: any) => membership.circleId).filter(Boolean) as string[];
        const circleObjectIds = circleIds
            .map((id) => {
                try {
                    return new ObjectId(id);
                } catch {
                    return null;
                }
            })
            .filter(Boolean) as ObjectId[];
        const circles = await Circles.find(
            { _id: { $in: circleObjectIds } },
            { projection: { _id: 1, did: 1, circleType: 1 } },
        ).toArray();
        const allowedCircleIds = circles
            .filter((circle: any) => circle.circleType !== "user" || circle.did === userDid)
            .map((circle: any) => circle._id.toString());

        const rooms = await listConversationsForUser(userDid, allowedCircleIds);
        const groupRoomIds = rooms
            .filter((room) => !room.isDirect && typeof room._id === "string" && room._id.length > 0)
            .map((room) => room._id as string);
        const groupRoomObjectIds = groupRoomIds.filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id));

        const groupRooms = groupRoomObjectIds.length
            ? await ChatRooms.find({ _id: { $in: groupRoomObjectIds } }, { projection: { _id: 1, picture: 1 } }).toArray()
            : [];
        const groupRoomById = new Map(groupRooms.map((room: any) => [room._id.toString(), room]));

        const memberQuery: any = { $or: [{ chatRoomId: { $in: groupRoomIds } }] };
        if (groupRoomObjectIds.length > 0) {
            memberQuery.$or.push({ chatRoomId: { $in: groupRoomObjectIds } });
        }
        const memberships =
            groupRoomIds.length > 0
                ? await ChatRoomMembers.find(memberQuery, {
                      projection: { chatRoomId: 1, status: 1, active: 1, isActive: 1 },
                  }).toArray()
                : [];

        const groupMemberCounts = new Map<string, number>();
        for (const membership of memberships) {
            if (!isActiveGroupMembership(membership)) continue;
            const rawChatRoomId = (membership as any).chatRoomId;
            const chatRoomId = typeof rawChatRoomId === "string" ? rawChatRoomId : rawChatRoomId?.toString?.();
            if (!chatRoomId) continue;
            groupMemberCounts.set(chatRoomId, (groupMemberCounts.get(chatRoomId) || 0) + 1);
        }

        const conversationIds = rooms.map((room) => room._id || room.handle).filter(Boolean) as string[];
        const unreadCounts = await getUnreadCountsForUser(userDid, conversationIds);
        const roomsWithUnread = rooms.map((room) => ({
            ...room,
            picture:
                room.picture ||
                (!room.isDirect && typeof room._id === "string" ? (groupRoomById.get(room._id)?.picture as any) : undefined),
            memberCount:
                !room.isDirect && typeof room._id === "string" ? groupMemberCounts.get(room._id) || 0 : undefined,
            unreadCount: room._id || room.handle ? unreadCounts[(room._id || room.handle) as string] || 0 : 0,
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
        const conversationMetadata = (access.conversation as any)?.metadata as Record<string, unknown> | undefined;
        const fallbackSystemAuthor = getSystemTemplateAuthor(conversationMetadata);
        const conversationRepliesDisabled = conversationMetadata?.repliesDisabled === true;

        const senderDids = Array.from(new Set(docs.map((doc) => doc.senderDid)));
        const senders = senderDids.length ? await getCirclesByDids(senderDids) : [];
        const senderByDid = new Map(senders.map((circle) => [circle.did, circle]));
        for (const senderDid of senderDids) {
            if (!senderByDid.has(senderDid)) {
                const byHandle = await getCircleByHandle(senderDid);
                if (byHandle?.did) senderByDid.set(senderDid, byHandle);
            }
        }

        const replyIds = Array.from(new Set(docs.map((doc) => doc.replyToMessageId).filter(Boolean) as string[]));
        const replyObjectIds = replyIds.map((id) => new ObjectId(id));
        const replyDocs = replyObjectIds.length
            ? ((await ChatMessageDocs.find({ _id: { $in: replyObjectIds } }).toArray()) as any[])
            : [];
        const replyById = new Map(
            replyDocs.map((reply) => [reply._id.toString(), { ...reply, _id: reply._id.toString() }]),
        );

        const messages = docs.map((doc) => {
            const systemMetadata = normalizeSystemMessageMetadata({
                source: doc.source,
                version: doc.version,
                system: (doc as any).system,
                repliesDisabled: conversationRepliesDisabled,
            });
            const isTemplateSystemMessage = systemMetadata.messageType === "system";
            const isWelcomeSystemMessage = systemMetadata.systemType === "welcome";
            const isPlatformAnnouncementMessage =
                systemMetadata.systemType === "announcement" &&
                (systemMetadata.source === "platform_admin" ||
                    (typeof (doc as any)?.broadcastId === "string" && ((doc as any).broadcastId as string).length > 0));
            const shouldUseSystemTemplateAuthor = isWelcomeSystemMessage || isPlatformAnnouncementMessage;
            const author =
                (shouldUseSystemTemplateAuthor ? fallbackSystemAuthor : senderByDid.get(doc.senderDid)) ||
                (isTemplateSystemMessage
                    ? fallbackSystemAuthor
                    : ({
                          _id: doc.senderDid,
                          name: doc.senderDid,
                          picture: { url: "/placeholder.svg" },
                      } as Circle));

            const replyDoc = doc.replyToMessageId ? replyById.get(doc.replyToMessageId) : undefined;
            const replyAuthor = replyDoc
                ? senderByDid.get(replyDoc.senderDid) ||
                  (isSystemMessageSource(replyDoc.source)
                      ? fallbackSystemAuthor
                      : ({
                            _id: replyDoc.senderDid,
                            name: replyDoc.senderDid,
                            picture: { url: "/placeholder.svg" },
                        } as Circle))
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

            const normalizedAttachments = Array.isArray(doc.attachments)
                ? doc.attachments.map((attachment) => ({
                      ...attachment,
                      url: normalizeMediaUrl(attachment?.url) || attachment?.url,
                  }))
                : doc.attachments;
            (message as any).attachments = normalizedAttachments;
            (message as any).editedAt = doc.editedAt;
            (message as any).format = doc.format;
            (message as any).source = doc.source;
            (message as any).version = doc.version;
            (message as any).system = systemMetadata;
            (message as any).broadcastId = (doc as any).broadcastId;

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
    if (access.conversation?.type === "announcement") {
        return { success: false, message: "Replies are disabled for this conversation." };
    }

    const replyValidation = await validateReplyTargetForConversation(conversationId, replyToMessageId);
    if (!replyValidation.ok) {
        return { success: false, message: replyValidation.message };
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
    if (access.conversation?.type === "announcement") {
        return { success: false, message: "Replies are disabled for this conversation." };
    }

    const replyValidation = await validateReplyTargetForConversation(conversationId, replyToMessageId);
    if (!replyValidation.ok) {
        return { success: false, message: replyValidation.message };
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

    let messageDoc: { conversationId?: string } | null = null;
    try {
        messageDoc = (await ChatMessageDocs.findOne({ _id: new ObjectId(messageId) }, { projection: { conversationId: 1 } })) as
            | { conversationId?: string }
            | null;
    } catch {
        return { success: false, message: "Invalid message id" };
    }

    if (!messageDoc?.conversationId) {
        return { success: false, message: "Message not found" };
    }

    const access = await resolveMongoConversationAccess(messageDoc.conversationId, userDid);
    if (!access.ok) {
        return { success: false, message: access.message };
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

    // DM rooms use handle: dm-<didA>-<didB> (sorted)
    const participants = [currentUser.did!, recipient.did!].sort();
    const dmHandle = `dm-${participants[0]}-${participants[1]}`;
    // Why this broke: list-based rediscovery depends on Members -> allowedCircleIds.
    // In prod, incomplete Members can hide the DM even when it was just created.
    const dmConversation =
        (await ChatConversations.findOne({
            type: "dm",
            handle: dmHandle,
            participants: { $all: participants },
            archived: { $ne: true },
        })) ||
        (await ChatConversations.findOne({
            type: "dm",
            participants: { $all: participants },
            archived: { $ne: true },
        }));

    if (!dmConversation) {
        return { success: false, message: "Failed to create DM room" };
    }

    const chatRoom = await mapConversationToChatRoomDisplay(userDid, dmConversation as any);
    return chatRoom ? { success: true, chatRoom } : { success: false, message: "Failed to create DM room" };
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

        const conversationId = conversation._id as string;
        const now = new Date();
        for (const participantDid of participants) {
            const role = participantDid === userDid ? "admin" : "member";
            await ChatRoomMembers.updateOne(
                {
                    userDid: participantDid,
                    chatRoomId: conversationId,
                },
                {
                    $setOnInsert: {
                        userDid: participantDid,
                        chatRoomId: conversationId,
                        joinedAt: now,
                    },
                    $set: { role, status: "active", active: true, isActive: true } as any,
                },
                { upsert: true },
            );
        }

        return { success: true, roomId: conversation._id as string };
    } catch (error) {
        console.error("❌ Error creating mongo group chat:", error);
        return { success: false, message: error instanceof Error ? error.message : "Failed to create group chat" };
    }
};

export const contactCircleAdminsAction = async (
    circleId: string,
    message: string,
    offeredSkillHandles: string[] = [],
): Promise<{ success: boolean; roomId?: string; message?: string; created?: boolean }> => {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "You need to be logged in to contact this circle" };
    }

    const trimmedMessage = message?.trim();
    if (!circleId) {
        return { success: false, message: "Missing circle id" };
    }
    if (!trimmedMessage) {
        return { success: false, message: "Message is required" };
    }

    const circle = await getCircleById(circleId);
    if (!circle?._id) {
        return { success: false, message: "Circle not found" };
    }
    if (circle.circleType === "user") {
        return { success: false, message: "This contact flow is available for circles and projects only" };
    }

    const adminRows = await Members.find(
        { circleId, userGroups: "admins" },
        { projection: { userDid: 1 } },
    ).toArray();
    const adminDids = Array.from(
        new Set(
            adminRows
                .map((row: any) => (typeof row?.userDid === "string" ? row.userDid : undefined))
                .filter((did): did is string => !!did),
        ),
    );

    if (adminDids.length === 0) {
        return { success: false, message: "No circle admins available for contact yet" };
    }

    const adminDidSet = new Set(adminDids);
    const baseParticipants = Array.from(new Set([userDid, ...adminDids]));
    const threadName = `Offer Help: ${circle.name || "Circle"}`;
    const threadHandle = buildCircleContactHandle(circleId, userDid);
    const requester = await getCircleByDid(userDid);
    const requesterName = requester?.name?.trim() || "A member";
    const offeredSkillNames = Array.from(
        new Set(
            (offeredSkillHandles || [])
                .filter((handle): handle is string => typeof handle === "string" && !!handle.trim())
                .map((handle) => skillNameByHandle.get(handle) || handle),
        ),
    );
    const offeredSkillsContext =
        offeredSkillNames.length > 0
            ? `${requesterName} offered to help with:\n${offeredSkillNames.map((skill) => `• ${skill}`).join("\n")}`
            : "";

    try {
        const existingConversation = await ChatConversations.findOne({
            type: "group",
            circleId,
            handle: threadHandle,
            archived: { $ne: true },
        });

        let conversationId = "";
        let created = false;
        let participants = baseParticipants;

        if (existingConversation) {
            conversationId = existingConversation._id.toString();
            participants = Array.from(new Set([...(existingConversation.participants || []), ...baseParticipants]));

            if (ObjectId.isValid(conversationId)) {
                await ChatConversations.updateOne(
                    { _id: new ObjectId(conversationId) },
                    {
                        $set: {
                            participants,
                            circleId,
                            name: threadName,
                            metadata: {
                                ...(existingConversation.metadata || {}),
                                source: CIRCLE_CONTACT_SOURCE,
                                version: CIRCLE_CONTACT_VERSION,
                            },
                            updatedAt: new Date(),
                        },
                    },
                );
            }
        } else {
            const conversation = await createConversation({
                type: "group",
                circleId,
                name: threadName,
                handle: threadHandle,
                participants,
                createdAt: new Date(),
                updatedAt: new Date(),
                metadata: {
                    source: CIRCLE_CONTACT_SOURCE,
                    version: CIRCLE_CONTACT_VERSION,
                },
            });

            conversationId = String(conversation._id);
            created = true;
        }

        const now = new Date();
        for (const participantDid of participants) {
            const role = adminDidSet.has(participantDid) ? "admin" : "member";
            await ChatRoomMembers.updateOne(
                buildChatRoomMembershipFilter(participantDid, conversationId),
                {
                    $setOnInsert: {
                        userDid: participantDid,
                        chatRoomId: conversationId,
                        joinedAt: now,
                    },
                    $set: {
                        circleId,
                        role,
                        status: "active",
                        active: true,
                        isActive: true,
                    } as any,
                },
                { upsert: true },
            );
        }

        if (offeredSkillsContext) {
            await createMessage({
                conversationId,
                senderDid: userDid,
                body: offeredSkillsContext,
                createdAt: new Date(),
            });
        }

        await createMessage({
            conversationId,
            senderDid: userDid,
            body: trimmedMessage,
            createdAt: new Date(),
        });

        return { success: true, roomId: conversationId, created };
    } catch (error) {
        console.error("❌ Error creating circle contact thread:", error);
        return { success: false, message: error instanceof Error ? error.message : "Failed to contact circle admins" };
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
    if (!userDid) return { success: false, message: "You need to be logged in." };

    const access = await resolveMongoConversationAccess(conversationId, userDid);
    if (!access.ok) return { success: false, message: access.message };

    let effectiveLastSeen = lastSeenMessageId;

    // If caller passes null, mark up to the true latest message in the conversation.
    if (effectiveLastSeen === null) {
        const latest = await ChatMessageDocs
            .find({ conversationId })
            .sort({ _id: -1 })
            .limit(1)
            .toArray();

        effectiveLastSeen = latest?.[0]?._id ? latest[0]._id.toString() : null;
    }

    await markConversationRead(userDid, conversationId, effectiveLastSeen);
    return { success: true };
};
