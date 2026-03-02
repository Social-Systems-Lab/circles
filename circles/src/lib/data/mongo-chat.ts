import { ObjectId } from "mongodb";
import { ChatRoomDisplay, Circle } from "@/models/models";
import { ChatConversation, ChatMessageDoc, ChatReaction } from "@/lib/chat/mongo-types";
import { ChatConversations, ChatMessageDocs, ChatReadStates, ChatRoomMembers } from "./db";
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

const isActiveGroupMembership = (membership: any): boolean => {
    if (!membership) return false;

    const membershipStatus = typeof membership.status === "string" ? membership.status.toLowerCase() : undefined;
    if (membershipStatus === "removed" || membershipStatus === "left" || membershipStatus === "inactive") {
        return false;
    }
    if (membershipStatus && membershipStatus !== "active") {
        return false;
    }
    if (membership.active === false || membership.isActive === false) {
        return false;
    }

    return true;
};

const normalizeMediaUrl = (url?: string): string | undefined => {
    if (!url) return undefined;

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

type ConversationMediaKind = "image" | "video" | "file";

type ConversationMediaItem = {
    url: string;
    mime: string;
    name?: string;
    size?: number;
    kind: ConversationMediaKind;
    createdAt: Date;
    messageId: string;
};

const inferMediaKind = (mimeType?: string, name?: string): ConversationMediaKind => {
    const normalizedMime = (mimeType || "").toLowerCase();
    if (normalizedMime.startsWith("image/")) return "image";
    if (normalizedMime.startsWith("video/")) return "video";

    const normalizedName = (name || "").toLowerCase();
    if (/\.(png|jpe?g|gif|webp|bmp|svg|avif)$/i.test(normalizedName)) return "image";
    if (/\.(mp4|mov|webm|avi|mkv|m4v)$/i.test(normalizedName)) return "video";

    return "file";
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
    console.log('DEBUG findConversationByHandleForUser', { userDid, handle });
    // 1) Group chats by circle handle
    const circle = await getCircleByHandle(handle);
    if (circle?._id) {
        const circleConversation = await findConversationByCircleId(circle._id as string);
        if (circleConversation) return circleConversation;
    }

    // 2) DM bootstrap for legacy URLs: dm-<id>-<id>
    // Only allow if conversation already exists (do NOT auto-create from handle)
    if (handle.startsWith("dm-")) {
        const parts = handle.split("-");
        if (parts.length === 3) {
            const a = parts[1];
            const b = parts[2];
            if (a === userDid || b === userDid) {
                const participants = [a, b].sort();
                const existing = (await ChatConversations.findOne({
                    type: "dm",
                    participants: { $all: participants },
                    archived: { $ne: true },
                })) as ChatConversation | null;

                // Only return existing conversation — do NOT auto-create
                if (existing) return normalizeConversation(existing);
            }
        }
    }

    // 3) Fallback: existing conversation by handle that includes the user
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

const mapConversationsToChatRoomDisplays = async (
    userDid: string,
    conversations: ChatConversation[],
): Promise<ChatRoomDisplay[]> => {
    const participantDids = Array.from(
        new Set(conversations.flatMap((conversation) => conversation.participants || [])),
    );
    const circles = participantDids.length ? await getCirclesByDids(participantDids) : [];
    const circleByDid = new Map(circles.map((circle) => [circle.did, circle]));

    const circleIdsToLoad = Array.from(
        new Set(conversations.map((conversation) => conversation.circleId).filter(Boolean) as string[]),
    );
    const circleById = new Map<string, Circle>();
    for (const id of circleIdsToLoad) {
        const circle = await getCircleById(id);
        if (circle) {
            circleById.set(id, circle);
        }
    }

    return conversations.map((conversation) => {
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
            _id: conversation._id.toString(),
            matrixRoomId: conversation._id.toString(),
            name: circle?.name || otherCircle?.name || conversation.name || "Chat",
            description: conversation.description || circle?.description,
            handle: circle?.handle || (isDirect ? conversation.handle : otherCircle?.handle) || conversation.handle || "chat",
            circleId: conversation.circleId,
            createdAt: conversation.createdAt,
            userGroups: [],
            picture: conversation.picture || circle?.picture || otherCircle?.picture,
            isDirect,
            dmParticipants,
            circle,
        } as ChatRoomDisplay;
    });
};

export const mapConversationToChatRoomDisplay = async (
    userDid: string,
    conversation: ChatConversation,
): Promise<ChatRoomDisplay | null> => {
    const normalizedConversation = normalizeConversation({ ...conversation });
    const rooms = await mapConversationsToChatRoomDisplays(userDid, [normalizedConversation]);
    return rooms[0] || null;
};

export const listConversationsForUser = async (userDid: string, circleIds: string[]): Promise<ChatRoomDisplay[]> => {
    const circleConversationIds: string[] = [];
    for (const circleId of circleIds) {
        const conversation = await ensureConversationForCircle(circleId);
        circleConversationIds.push(conversation._id as string);
    }

    const circleConversationObjectIds = circleConversationIds
        .filter((id) => ObjectId.isValid(id))
        .map((id) => new ObjectId(id));
    const dmConversations = (await ChatConversations.find({
        type: "dm",
        participants: userDid,
        archived: { $ne: true },
    }).toArray()) as ChatConversation[];
    // Why this broke: on prod, incomplete Members rows can make allowed circle ids empty.
    // DMs must never depend on circle-derived visibility to show up after creation.
    const groupConversations = (await ChatConversations.find({
        type: { $ne: "dm" },
        archived: { $ne: true },
        $or: [{ participants: userDid }, { _id: { $in: circleConversationObjectIds } }],
    }).toArray()) as ChatConversation[];

    const normalized = Array.from(
        new Map(
            [...dmConversations, ...groupConversations].map((conversation) => [
                conversation._id.toString(),
                normalizeConversation(conversation),
            ]),
        ).values(),
    );
    const groupConversationIds = normalized
        .filter((conversation) => conversation.type === "group" && conversation?._id)
        .map((conversation) => conversation._id.toString());
    const groupConversationById = new Map(
        normalized
            .filter((conversation) => conversation.type === "group" && conversation?._id)
            .map((conversation) => [conversation._id.toString(), conversation]),
    );
    const groupConversationObjectIds = groupConversationIds
        .filter((id) => ObjectId.isValid(id))
        .map((id) => new ObjectId(id));

    const activeGroupConversationIds = new Set<string>();
    const participantGroupConversationIds = new Set<string>();
    for (const [conversationId, conversation] of groupConversationById.entries()) {
        if ((conversation.participants || []).includes(userDid)) {
            participantGroupConversationIds.add(conversationId);
        }
    }

    if (groupConversationIds.length > 0) {
        const membershipQuery: any = {
            userDid,
            $or: [{ chatRoomId: { $in: groupConversationIds } }],
        };
        if (groupConversationObjectIds.length > 0) {
            membershipQuery.$or.push({ chatRoomId: { $in: groupConversationObjectIds } });
        }

        const memberships = await ChatRoomMembers.find(membershipQuery, {
            projection: { chatRoomId: 1, status: 1, active: 1, isActive: 1 },
        }).toArray();

        for (const membership of memberships) {
            if (!isActiveGroupMembership(membership)) {
                continue;
            }
            const rawChatRoomId = (membership as { chatRoomId?: unknown }).chatRoomId;
            const chatRoomId = rawChatRoomId ? String(rawChatRoomId) : undefined;
            if (chatRoomId) {
                activeGroupConversationIds.add(chatRoomId);
            }
        }
    }

    const fallbackGroupConversationIds = Array.from(participantGroupConversationIds).filter(
        (conversationId) => !activeGroupConversationIds.has(conversationId),
    );
    if (fallbackGroupConversationIds.length > 0) {
        // Why this broke: some group creation paths don't write memberships OR userDid source differs.
        // Keep groups visible from participants and lazily backfill memberships only when none exist.
        const fallbackGroupConversationObjectIds = fallbackGroupConversationIds
            .filter((id) => ObjectId.isValid(id))
            .map((id) => new ObjectId(id));
        const fallbackMembershipQuery: any = { $or: [{ chatRoomId: { $in: fallbackGroupConversationIds } }] };
        if (fallbackGroupConversationObjectIds.length > 0) {
            fallbackMembershipQuery.$or.push({ chatRoomId: { $in: fallbackGroupConversationObjectIds } });
        }

        const fallbackMemberships = await ChatRoomMembers.find(fallbackMembershipQuery, {
            projection: { chatRoomId: 1, userDid: 1 },
        }).toArray();
        const fallbackMembershipIds = new Set(
            fallbackMemberships
                .map((membership) => {
                    const rawChatRoomId = (membership as { chatRoomId?: unknown }).chatRoomId;
                    return rawChatRoomId ? String(rawChatRoomId) : null;
                })
                .filter(Boolean) as string[],
        );

        for (const conversationId of fallbackGroupConversationIds) {
            const conversation = groupConversationById.get(conversationId);
            if (!conversation) {
                continue;
            }

            if (!fallbackMembershipIds.has(conversationId)) {
                const participants = Array.from(
                    new Set((conversation.participants || []).filter((participantDid) => !!participantDid)),
                );
                if (participants.length > 0) {
                    const conversationJoinedAt = conversation.createdAt || new Date();
                    await ChatRoomMembers.bulkWrite(
                        participants.map((participantDid) => ({
                            updateOne: {
                                filter: { userDid: participantDid, chatRoomId: conversationId },
                                update: {
                                    $setOnInsert: {
                                        userDid: participantDid,
                                        chatRoomId: conversationId,
                                        circleId: conversation.circleId,
                                        joinedAt: conversationJoinedAt,
                                        role: "member",
                                        status: "active",
                                        active: true,
                                        isActive: true,
                                    } as any,
                                },
                                upsert: true,
                            },
                        })),
                        { ordered: false },
                    );
                }
            }

            activeGroupConversationIds.add(conversationId);
        }
    }

    const visibleConversations = normalized.filter((conversation) => {
        if (conversation.type === "dm") return true;
        const conversationId = conversation._id.toString();
        return activeGroupConversationIds.has(conversationId) || participantGroupConversationIds.has(conversationId);
    });

    // Why this broke: Mongo does not guarantee document order.
    // Without explicit sorting, production can render inconsistent or empty lists.
    // Always sort by latest activity.
    visibleConversations.sort((a, b) => {
        const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        return bTime - aTime;
    });
    
    return mapConversationsToChatRoomDisplays(userDid, visibleConversations);
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
    // Why this broke: conversation.updatedAt was never bumped on message send,
    // so new DMs never appeared active in the chat list on prod.
    await ChatConversations.updateOne(
        { _id: new ObjectId(message.conversationId) },
        { $set: { updatedAt: new Date() } },
    );
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

export const markConversationRead = async (
    userDid: string,
    conversationId: string,
    lastReadMessageId: string | null,
): Promise<void> => {
    await ChatReadStates.updateOne(
        { conversationId, userDid },
        {
            $set: {
                lastReadMessageId,
                updatedAt: new Date(),
            },
        },
        { upsert: true },
    );
};

export const getUnreadCountsForUser = async (
    userDid: string,
    conversationIds: string[],
): Promise<Record<string, number>> => {
    if (!conversationIds.length) return {};

    const readStates = await ChatReadStates.find({
        userDid,
        conversationId: { $in: conversationIds },
    }).toArray();

    const lastReadByConversation = new Map(
        readStates.map((state) => [state.conversationId, state.lastReadMessageId]),
    );

    const counts: Record<string, number> = {};
    for (const conversationId of conversationIds) {
        const lastReadId = lastReadByConversation.get(conversationId);
        const query: any = { conversationId, senderDid: { $ne: userDid } };
        const lastReadObjectId = toObjectId(lastReadId);
        if (lastReadObjectId) {
            query._id = { $gt: lastReadObjectId };
        }
        counts[conversationId] = await ChatMessageDocs.countDocuments(query);
    }

    return counts;
};

export async function listConversationMedia(
    conversationId: string,
    kind?: "image" | "video" | "file",
    limit: number = 50,
): Promise<ConversationMediaItem[]> {
    if (!conversationId) return [];

    const safeLimit = Math.min(Math.max(limit, 1), 200);
    const messages = (await ChatMessageDocs.find(
        {
            conversationId,
            attachments: { $exists: true, $ne: [] },
        },
        {
            projection: { _id: 1, createdAt: 1, attachments: 1 },
        },
    )
        .sort({ createdAt: -1, _id: -1 })
        .toArray()) as Array<Pick<ChatMessageDoc, "_id" | "createdAt" | "attachments">>;

    const media: ConversationMediaItem[] = [];
    for (const message of messages) {
        const messageId = message?._id ? String(message._id) : "";
        if (!messageId || !Array.isArray(message.attachments)) {
            continue;
        }

        for (const attachment of message.attachments) {
            const url = normalizeMediaUrl(attachment?.url) || attachment?.url;
            if (!url) continue;

            const attachmentKind = inferMediaKind(attachment?.mimeType, attachment?.name);
            if (kind && attachmentKind !== kind) continue;

            media.push({
                url,
                mime: attachment?.mimeType || "application/octet-stream",
                name: attachment?.name,
                size: attachment?.size,
                kind: attachmentKind,
                createdAt: message.createdAt,
                messageId,
            });

            if (media.length >= safeLimit) {
                return media;
            }
        }
    }

    return media;
}
