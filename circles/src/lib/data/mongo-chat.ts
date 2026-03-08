import { ObjectId } from "mongodb";
import { ChatRoomDisplay, Circle } from "@/models/models";
import { ChatConversation, ChatMessageDoc, ChatReaction } from "@/lib/chat/mongo-types";
import { ChatConversations, ChatMessageDocs, ChatReadStates, ChatRoomMembers } from "./db";
import { getCircleByHandle, getCircleById, getCirclesByDids } from "./circle";
import { WelcomeMessageConfig, WELCOME_MESSAGE } from "@/config/welcome-message";

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

const WELCOME_CONVERSATION_HANDLE_PREFIX = "welcome";
const buildWelcomeSystemDid = (config: WelcomeMessageConfig): string => `system:${config.senderHandle}`;

const buildWelcomeConversationMetadata = (config: WelcomeMessageConfig) => ({
    source: config.source,
    version: config.version,
    repliesDisabled: config.repliesDisabled,
    senderHandle: config.senderHandle,
    senderName: config.displayName,
    senderAvatarUrl: config.avatarUrl,
});

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

export const ensureWelcomeMessageForNewUser = async (
    userDid: string,
    config: WelcomeMessageConfig = WELCOME_MESSAGE,
): Promise<{ conversationId: string; messageCreated: boolean }> => {
    if (!userDid) {
        throw new Error("Missing user DID for welcome message");
    }

    const systemSenderDid = buildWelcomeSystemDid(config);
    const welcomeMetadata = buildWelcomeConversationMetadata(config);
    const welcomeHandle = `${WELCOME_CONVERSATION_HANDLE_PREFIX}-${userDid}`;
    const existingConversation = (await ChatConversations.findOne({
        type: "dm",
        handle: welcomeHandle,
        participants: userDid,
        archived: { $ne: true },
    })) as ChatConversation | null;

    const conversation =
        existingConversation ||
        (await createConversation({
            type: "dm",
            name: config.threadName,
            handle: welcomeHandle,
            participants: [userDid],
            createdAt: new Date(),
            updatedAt: new Date(),
            picture: { url: config.avatarUrl },
            metadata: welcomeMetadata,
        }));

    const conversationId = String(conversation._id);
    const conversationObjectId = toObjectId(conversationId);
    if (conversationObjectId) {
        await ChatConversations.updateOne(
            { _id: conversationObjectId },
            {
                $set: {
                    name: config.threadName,
                    picture: { url: config.avatarUrl },
                    metadata: welcomeMetadata,
                    updatedAt: new Date(),
                },
            },
        );
    }

    const existingWelcomeMessage = await ChatMessageDocs.findOne({
        conversationId,
        source: config.source,
    }, { sort: { createdAt: 1 } });

    if (existingWelcomeMessage) {
        const messageObjectId = toObjectId(String(existingWelcomeMessage._id));
        if (messageObjectId) {
            await ChatMessageDocs.updateOne(
                { _id: messageObjectId },
                {
                    $set: {
                        senderDid: systemSenderDid,
                        body: config.markdown,
                        format: "markdown",
                        source: config.source,
                        version: config.version,
                    },
                },
            );
        }
        return { conversationId, messageCreated: false };
    }

    await createMessage({
        conversationId,
        senderDid: systemSenderDid,
        body: config.markdown,
        createdAt: new Date(),
        format: "markdown",
        source: config.source,
        version: config.version,
    });

    return { conversationId, messageCreated: true };
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
    const groupConversationIds = normalized
        .filter((conversation) => conversation.type === "group" && conversation?._id)
        .map((conversation) => conversation._id.toString());
    const groupConversationObjectIds = groupConversationIds
        .filter((id) => ObjectId.isValid(id))
        .map((id) => new ObjectId(id));

    const activeGroupConversationIds = new Set<string>();
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

    const visibleConversations = normalized.filter((conversation) => {
        if (conversation.type === "dm") return true;
        return activeGroupConversationIds.has(conversation._id.toString());
    });
    const participantDids = Array.from(
        new Set(visibleConversations.flatMap((conversation) => conversation.participants || [])),
    );
    const circles = participantDids.length ? await getCirclesByDids(participantDids) : [];
    const circleByDid = new Map(circles.map((circle) => [circle.did, circle]));

    const circleIdsToLoad = Array.from(
        new Set(visibleConversations.map((conversation) => conversation.circleId).filter(Boolean) as string[]),
    );
    const circleById = new Map<string, Circle>();
    for (const id of circleIdsToLoad) {
        const circle = await getCircleById(id);
        if (circle) {
            circleById.set(id, circle);
        }
    }

    return visibleConversations.map((conversation) => {
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
            metadata: conversation.metadata,
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
