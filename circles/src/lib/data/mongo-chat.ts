import { ObjectId } from "mongodb";
import { ChatRoomDisplay, Circle } from "@/models/models";
import { ChatAttachment, ChatConversation, ChatMessageDoc, ChatReaction, ChatReadState } from "@/lib/chat/mongo-types";
import { ChatConversations, ChatMessageDocs, ChatReadStates, ChatRoomMembers, ChatTopicReadStates } from "./db";
import { getCircleByHandle, getCircleById, getCirclesByDids } from "./circle";
import { getKamooniSystemSender, SystemSenderIdentity } from "@/config/system-sender";
import { WelcomeMessageConfig, WELCOME_MESSAGE } from "@/config/welcome-message";
import { buildSystemMessageMetadata } from "@/lib/chat/system-messages";
import { syncPlatformBroadcastsForUser } from "@/lib/data/platform-broadcasts";
import { buildLatestConversationMessageLookup } from "@/lib/chat/conversation-read-state";
import { buildUnreadMessagesQuery } from "@/lib/chat/unread-counts";
import {
    CHAT_READ_STATE_VERSION,
    normalizeObjectIdHex,
    resolveTopicMigrationFallback,
    resolveTopicReadBoundary,
    sumConversationUnreadCounts,
    validateTopicCursorCandidate,
} from "@/lib/chat/topic-read-state";
import { buildLegacyLooseMessageQuery } from "@/lib/chat/legacy-messages";
import { buildConversationUpdatedAtCompareAndSetFilter } from "@/lib/chat/topic-mutations";
import { canWriteCircleByLifecycle } from "@/lib/data/circle-lifecycle-policy";
import {
    buildMonotonicLegacyCursorUpdate,
    buildReadStateV2InitializationOperation,
    resolveHistoricalReadBoundary,
} from "@/lib/chat/chat-read-state-v2";

// High-value indexes for chat list/message paths.
ChatConversations?.createIndex({ participants: 1, type: 1, archived: 1, updatedAt: -1 });
ChatConversations?.createIndex({ circleId: 1, type: 1, archived: 1 });
ChatRoomMembers?.createIndex({ userDid: 1, chatRoomId: 1 });
ChatRoomMembers?.createIndex({ chatRoomId: 1 });
ChatMessageDocs?.createIndex({ conversationId: 1, _id: 1 });
ChatReadStates?.createIndex({ userDid: 1, conversationId: 1 });
ChatMessageDocs?.createIndex({ conversationId: 1, threadId: 1, _id: 1 });

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
const buildWelcomeConversationMetadata = (config: WelcomeMessageConfig, sender: SystemSenderIdentity) => ({
    source: config.source,
    version: config.version,
    repliesDisabled: config.repliesDisabled,
    senderHandle: sender.handle,
    senderName: sender.displayName,
    senderAvatarUrl: sender.avatarUrl,
});

const buildWelcomeSystemMetadata = (config: WelcomeMessageConfig, userDid: string) =>
    buildSystemMessageMetadata({
        systemType: "welcome",
        source: "signup",
        targetDid: userDid,
        repliesDisabled: config.repliesDisabled,
        templateKey: "welcome",
        version: config.version,
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
    console.log("DEBUG findConversationByHandleForUser", { userDid, handle });
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
    senderDid?: string,
): Promise<{ conversationId: string; messageCreated: boolean }> => {
    if (!userDid) {
        throw new Error("Missing user DID for welcome message");
    }

    const canonicalSender = getKamooniSystemSender();
    const systemSenderDid = senderDid || canonicalSender.did;
    const welcomeMetadata = buildWelcomeConversationMetadata(config, canonicalSender);
    const welcomeSystemMetadata = buildWelcomeSystemMetadata(config, userDid);
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
            picture: { url: canonicalSender.avatarUrl },
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
                    picture: { url: canonicalSender.avatarUrl },
                    metadata: welcomeMetadata,
                    updatedAt: new Date(),
                },
            },
        );
    }

    const existingWelcomeMessage = await ChatMessageDocs.findOne(
        {
            conversationId,
            source: config.source,
        },
        { sort: { createdAt: 1 } },
    );

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
                        system: welcomeSystemMetadata,
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
        system: welcomeSystemMetadata,
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
        const participantDids = Array.from(new Set((conversation.participants || []).filter(Boolean)));
        const participantCircles = participantDids
            .map((did) => circleByDid.get(did))
            .filter((participant): participant is Circle => !!participant);
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
        const conversationType = conversation.type;
        const metadataRepliesDisabled = conversation.metadata?.repliesDisabled === true;
        const repliesDisabled = conversationType === "announcement" || metadataRepliesDisabled;

        return {
            _id: conversation._id.toString(),
            matrixRoomId: conversation._id.toString(),
            name: circle?.name || otherCircle?.name || conversation.name || "Chat",
            description: conversation.description || circle?.description,
            handle:
                circle?.handle ||
                (isDirect ? conversation.handle : otherCircle?.handle) ||
                conversation.handle ||
                "chat",
            circleId: conversation.circleId,
            createdAt: conversation.createdAt,
            userGroups: [],
            picture: conversation.picture || circle?.picture || otherCircle?.picture,
            isDirect,
            dmParticipants,
            dmParticipantDids: isDirect ? participantDids : undefined,
            participantDids,
            participantCircles,
            circle,
            conversationType,
            repliesDisabled,
            metadata: conversation.metadata,
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
    try {
        await syncPlatformBroadcastsForUser(userDid);
    } catch (error) {
        console.error("Failed to sync platform broadcast for user:", error);
    }

    const circleConversationIds: string[] = [];
    for (const circleId of circleIds) {
        const circle = await getCircleById(circleId);
        const conversation = canWriteCircleByLifecycle(circle)
            ? await ensureConversationForCircle(circleId)
            : await ChatConversations.findOne({ circleId, archived: { $ne: true } });
        if (conversation?._id) circleConversationIds.push(conversation._id.toString());
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
        // Lazily backfill memberships only when none exist for a conversation.
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
        }
    }

    const visibleConversations = normalized.filter((conversation) => {
        if (conversation.type === "dm" || conversation.type === "announcement") return true;
        const conversationId = conversation._id.toString();
        return activeGroupConversationIds.has(conversationId);
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

export const fetchRecentMessages = async (conversationId: string, limit: number = 50): Promise<ChatMessageDoc[]> => {
    // Fetch the most recent messages by sorting descending, then reverse for display order
    const messages = (await ChatMessageDocs.find({ conversationId, threadId: { $exists: false } })
        .sort({ _id: -1 })
        .limit(limit)
        .toArray()) as ChatMessageDoc[];

    // Reverse so oldest-first for display
    messages.reverse();

    return messages.map((message) => {
        if (message._id) {
            message._id = message._id.toString();
        }
        return message;
    });
};

export const fetchTopicStarters = async (conversationId: string): Promise<ChatMessageDoc[]> => {
    const docs = (await ChatMessageDocs.find({ conversationId, thread: { $exists: true } })
        .sort({ createdAt: 1 })
        .toArray()) as ChatMessageDoc[];
    return docs.map((message) => {
        if (message._id) {
            message._id = message._id.toString();
        }
        return message;
    });
};

export const countLegacyLooseMessages = async (conversationId: string): Promise<number> => {
    return ChatMessageDocs.countDocuments(buildLegacyLooseMessageQuery(conversationId));
};

export const fetchLegacyLooseMessages = async (conversationId: string): Promise<ChatMessageDoc[]> => {
    const docs = (await ChatMessageDocs.find(buildLegacyLooseMessageQuery(conversationId))
        .sort({ createdAt: 1, _id: 1 })
        .toArray()) as ChatMessageDoc[];

    return docs.map((message) => {
        if (message._id) {
            message._id = message._id.toString();
        }
        return message;
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

    const messages = (await ChatMessageDocs.find(query).sort({ _id: 1 }).limit(limit).toArray()) as ChatMessageDoc[];

    return messages.map((message) => {
        if (message._id) {
            message._id = message._id.toString();
        }
        return message;
    });
};

export const getLatestMessageIdForConversation = async (conversationId: string): Promise<string | null> => {
    if (!conversationId) return null;

    const lookup = buildLatestConversationMessageLookup(conversationId);
    const latest = (await ChatMessageDocs.findOne(lookup.filter, lookup.options)) as Pick<ChatMessageDoc, "_id"> | null;

    return latest?._id ? latest._id.toString() : null;
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

export const updateMessage = async (messageId: string, userDid: string, body: string): Promise<boolean> => {
    const objectId = toObjectId(messageId);
    if (!objectId) return false;
    const result = await ChatMessageDocs.updateOne(
        { _id: objectId, senderDid: userDid },
        { $set: { body, editedAt: new Date() } },
    );
    return result.matchedCount > 0;
};

export type TopicMutationResult = {
    success: boolean;
    reason?: "invalid_id" | "not_found" | "forbidden" | "delete_failed";
    deletedReplyCount?: number;
};

export const updateTopic = async (
    topicId: string,
    conversationId: string,
    userDid: string,
    title: string,
    body: string,
): Promise<TopicMutationResult> => {
    const objectId = toObjectId(topicId);
    if (!objectId) return { success: false, reason: "invalid_id" };

    const topic = (await ChatMessageDocs.findOne(
        { _id: objectId, conversationId, thread: { $exists: true } },
        { projection: { senderDid: 1 } },
    )) as Pick<ChatMessageDoc, "senderDid"> | null;
    if (!topic) return { success: false, reason: "not_found" };
    if (topic.senderDid !== userDid) return { success: false, reason: "forbidden" };

    const result = await ChatMessageDocs.updateOne(
        {
            _id: objectId,
            conversationId,
            senderDid: userDid,
            thread: { $exists: true },
            "thread.deletingAt": { $exists: false },
        },
        {
            $set: {
                body,
                "thread.title": title,
                editedAt: new Date(),
            },
        },
    );

    return result.matchedCount > 0 ? { success: true } : { success: false, reason: "not_found" };
};

const recalculateConversationUpdatedAt = async (conversationId: string): Promise<void> => {
    const conversationObjectId = new ObjectId(conversationId);
    const conversation = (await ChatConversations.findOne(
        { _id: conversationObjectId },
        { projection: { createdAt: 1, updatedAt: 1 } },
    )) as Pick<ChatConversation, "createdAt" | "updatedAt"> | null;
    if (!conversation) return;

    const newestRemainingMessage = (await ChatMessageDocs.findOne(
        { conversationId },
        { sort: { createdAt: -1, _id: -1 }, projection: { createdAt: 1 } },
    )) as Pick<ChatMessageDoc, "createdAt"> | null;

    const updatedAt = newestRemainingMessage?.createdAt || conversation.createdAt;

    if (updatedAt) {
        // Only rewind the activity timestamp if no send updated the conversation
        // after our snapshot. A later send either makes this filter miss or runs
        // after this update and restores its own newer timestamp.
        await ChatConversations.updateOne(
            buildConversationUpdatedAtCompareAndSetFilter(conversationObjectId, conversation.updatedAt),
            { $set: { updatedAt } },
        );
    }
};

export const deleteTopic = async (
    topicId: string,
    conversationId: string,
    userDid: string,
): Promise<TopicMutationResult> => {
    const objectId = toObjectId(topicId);
    if (!objectId) return { success: false, reason: "invalid_id" };

    const topic = (await ChatMessageDocs.findOne(
        { _id: objectId, conversationId, thread: { $exists: true } },
        { projection: { senderDid: 1 } },
    )) as Pick<ChatMessageDoc, "senderDid"> | null;
    if (!topic) return { success: false, reason: "not_found" };
    if (topic.senderDid !== userDid) return { success: false, reason: "forbidden" };

    // Mark first so createThreadReply cannot accept new work while cleanup runs.
    await ChatMessageDocs.updateOne(
        { _id: objectId, conversationId, senderDid: userDid, thread: { $exists: true } },
        { $set: { "thread.deletingAt": new Date() } },
    );

    const replyFilter = { conversationId, threadId: topicId };
    const firstReplyDelete = await ChatMessageDocs.deleteMany(replyFilter);
    const starterDelete = await ChatMessageDocs.deleteOne({
        _id: objectId,
        conversationId,
        senderDid: userDid,
        thread: { $exists: true },
    });
    if (starterDelete.deletedCount === 0) {
        return { success: false, reason: "delete_failed" };
    }

    // A reply that passed its initial lookup immediately before the marker is
    // rolled back by createThreadReply; this second pass also makes cleanup idempotent.
    const secondReplyDelete = await ChatMessageDocs.deleteMany(replyFilter);
    await recalculateConversationUpdatedAt(conversationId);

    return {
        success: true,
        deletedReplyCount: firstReplyDelete.deletedCount + secondReplyDelete.deletedCount,
    };
};

export const deleteMessage = async (messageId: string, userDid: string): Promise<boolean> => {
    const objectId = toObjectId(messageId);
    if (!objectId) return false;
    const message = (await ChatMessageDocs.findOne({
        _id: objectId,
        senderDid: userDid,
    })) as ChatMessageDoc | null;
    if (!message) return false;

    const result = await ChatMessageDocs.deleteOne({ _id: objectId, senderDid: userDid });
    if (result.deletedCount > 0 && message.threadId && message.conversationId) {
        const threadStarter = (await ChatMessageDocs.findOne(
            { _id: new ObjectId(message.threadId), conversationId: message.conversationId, thread: { $exists: true } },
            { projection: { thread: 1 } },
        )) as ChatMessageDoc | null;
        const nextReplyCount = Math.max(((threadStarter?.thread?.replyCount as number | undefined) || 0) - 1, 0);

        await ChatMessageDocs.updateOne(
            { _id: new ObjectId(message.threadId), conversationId: message.conversationId, thread: { $exists: true } },
            {
                $set: {
                    "thread.updatedAt": new Date(),
                    "thread.replyCount": nextReplyCount,
                },
            },
        );
    }
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
    await ensureChatReadStateV2(userDid, conversationId);
    const identity = { conversationId, userDid };
    const now = new Date();
    const cursorUpdate = buildMonotonicLegacyCursorUpdate(lastReadMessageId, now);
    const update: Record<string, any> = {
        ...cursorUpdate,
        $setOnInsert: {
            ...identity,
            lastReadMessageId: null,
            topicFallbackMessageId: null,
            readStateVersion: CHAT_READ_STATE_VERSION,
            readStateMigratedAt: now,
        },
    };
    await ChatReadStates.updateOne(identity, update, { upsert: true });
};

const getHistoricalReadBoundary = async (conversationId: string, readState: ChatReadState): Promise<string | null> => {
    return resolveHistoricalReadBoundary(readState, async (updatedAt) => {
        const nextSecond = ObjectId.createFromTime(Math.floor(updatedAt.getTime() / 1000) + 1);
        const latestAtHistoricalRead = await ChatMessageDocs.findOne(
            {
                conversationId,
                _id: { $lt: nextSecond },
                $or: [{ createdAt: { $lte: updatedAt } }, { createdAt: { $exists: false } }],
            },
            { sort: { _id: -1 }, projection: { _id: 1 } },
        );
        return latestAtHistoricalRead?._id ? latestAtHistoricalRead._id.toString() : null;
    });
};

export const ensureChatReadStateV2 = async (userDid: string, conversationId: string): Promise<ChatReadState | null> => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
        const existing = (await ChatReadStates.findOne({ userDid, conversationId })) as ChatReadState | null;
        if (!existing || existing.readStateVersion === CHAT_READ_STATE_VERSION) return existing;
        if (!existing._id) throw new Error(`Cannot safely migrate chat read state without _id (${conversationId})`);

        const frozenBoundary = await getHistoricalReadBoundary(conversationId, existing);
        const migratedAt = new Date();
        const operation = buildReadStateV2InitializationOperation(existing, frozenBoundary, migratedAt);
        const result = await ChatReadStates.updateOne(operation.filter, operation.update);
        if (result.modifiedCount === 1) {
            return {
                ...existing,
                topicFallbackMessageId: frozenBoundary,
                legacyLastReadMessageId: frozenBoundary,
                readStateVersion: CHAT_READ_STATE_VERSION,
                readStateMigratedAt: migratedAt,
            };
        }
    }
    throw new Error(`Chat read state migration did not stabilize (${conversationId}, ${userDid})`);
};

export const getLatestLegacyMessageIdForConversation = async (conversationId: string): Promise<string | null> => {
    const latest = await ChatMessageDocs.findOne(
        { conversationId, threadId: { $exists: false }, thread: { $exists: false } },
        { sort: { _id: -1 }, projection: { _id: 1 } },
    );
    return latest?._id ? latest._id.toString() : null;
};

export const validateTopicReadCursor = async (
    conversationId: string,
    topicId: string,
    messageId: string,
): Promise<string | null> =>
    validateTopicCursorCandidate({
        conversationId,
        topicId,
        messageId,
        lookup: async ({
            conversationId: scopedConversationId,
            topicId: normalizedTopicId,
            messageId: normalizedId,
            kind,
        }) => {
            const messageObjectId = new ObjectId(normalizedId);
            const topicObjectId = new ObjectId(normalizedTopicId);
            const message = await ChatMessageDocs.findOne(
                kind === "starter"
                    ? {
                          _id: topicObjectId,
                          conversationId: scopedConversationId,
                          thread: { $exists: true },
                      }
                    : {
                          _id: messageObjectId,
                          conversationId: scopedConversationId,
                          threadId: normalizedTopicId,
                      },
                { projection: { _id: 1 } },
            );
            return !!message;
        },
    });

export const markTopicRead = async (
    userDid: string,
    conversationId: string,
    topicId: string,
    lastReadMessageId: string | null,
): Promise<void> => {
    const normalizedTopicId = normalizeObjectIdHex(topicId);
    if (!normalizedTopicId) throw new Error("Invalid topic read-state topic ID");
    const normalizedCursor = normalizeObjectIdHex(lastReadMessageId);
    if (lastReadMessageId && !normalizedCursor) throw new Error("Invalid topic read cursor");
    const identity = { userDid, conversationId, topicId: normalizedTopicId };
    if (!normalizedCursor) {
        await ChatTopicReadStates.updateOne(
            identity,
            { $set: { lastReadMessageId: null, updatedAt: new Date() } },
            { upsert: true },
        );
        return;
    }
    await ChatTopicReadStates.updateOne(
        identity,
        {
            $max: { lastReadMessageId: normalizedCursor },
            $set: { updatedAt: new Date() },
            $setOnInsert: identity,
        },
        { upsert: true },
    );
};

export const getTopicUnreadCountsForUser = async (
    userDid: string,
    conversationId: string,
    topicIds?: string[],
    includeStarters: boolean = true,
): Promise<Record<string, number>> => {
    const topics = topicIds?.length
        ? topicIds.map((topicId) => ({ _id: toObjectId(topicId) })).filter((topic) => topic._id)
        : await ChatMessageDocs.find(
              { conversationId, thread: { $exists: true } },
              { projection: { _id: 1 } },
          ).toArray();
    if (!topics.length) return {};

    const normalizedTopicIds = topics.map((topic) => topic._id!.toString());
    const [conversationReadState, topicReadStates] = await Promise.all([
        ensureChatReadStateV2(userDid, conversationId),
        ChatTopicReadStates.find({ userDid, conversationId, topicId: { $in: normalizedTopicIds } }).toArray(),
    ]);
    const explicitByTopic = new Map(topicReadStates.map((state) => [state.topicId, state.lastReadMessageId]));

    const migrationFallback = resolveTopicMigrationFallback(conversationReadState);
    const topicClauses = normalizedTopicIds.map((topicId) => {
        const boundary = resolveTopicReadBoundary({
            topicId,
            explicitLastReadMessageId: explicitByTopic.has(topicId) ? explicitByTopic.get(topicId) : undefined,
            conversationFallbackMessageId: migrationFallback,
        });
        const scope = includeStarters
            ? { $or: [{ _id: toObjectId(topicId), thread: { $exists: true } }, { threadId: topicId }] }
            : { threadId: topicId };
        const boundaryObjectId = toObjectId(boundary);
        return boundaryObjectId ? { $and: [scope, { _id: { $gt: boundaryObjectId } }] } : scope;
    });
    const rows = await ChatMessageDocs.aggregate<{ _id: string; count: number }>([
        { $match: { conversationId, senderDid: { $ne: userDid }, $or: topicClauses } },
        { $project: { topicId: { $ifNull: ["$threadId", { $toString: "$_id" }] } } },
        { $group: { _id: "$topicId", count: { $sum: 1 } } },
    ]).toArray();
    const counts: Record<string, number> = Object.fromEntries(normalizedTopicIds.map((topicId) => [topicId, 0]));
    for (const row of rows) counts[row._id] = row.count;
    return counts;
};

export const getLegacyUnreadCountForUser = async (userDid: string, conversationId: string): Promise<number> => {
    const readState = await ensureChatReadStateV2(userDid, conversationId);
    const lastReadObjectId = toObjectId(readState?.legacyLastReadMessageId);
    const legacyQuery = buildUnreadMessagesQuery(userDid, conversationId, lastReadObjectId || undefined);
    legacyQuery.threadId = { $exists: false };
    legacyQuery.thread = { $exists: false };
    return ChatMessageDocs.countDocuments(legacyQuery);
};

export const getUnreadCountsForUser = async (
    userDid: string,
    conversationIds: string[],
): Promise<Record<string, number>> => {
    if (!conversationIds.length) return {};

    const counts: Record<string, number> = {};
    for (const conversationId of conversationIds) {
        const [legacyUnread, topicUnreadCounts] = await Promise.all([
            getLegacyUnreadCountForUser(userDid, conversationId),
            getTopicUnreadCountsForUser(userDid, conversationId, undefined, true),
        ]);
        counts[conversationId] = sumConversationUnreadCounts(legacyUnread, topicUnreadCounts);
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

export const createThread = async (
    conversationId: string,
    senderDid: string,
    title: string,
    body: string,
    hashtags: string[],
): Promise<ChatMessageDoc | null> => {
    const now = new Date();
    const doc: ChatMessageDoc = {
        conversationId,
        senderDid,
        body,
        createdAt: now,
        thread: {
            title,
            hashtags,
            createdAt: now,
            updatedAt: now,
            replyCount: 0,
        },
    };
    const result = await ChatMessageDocs.insertOne(doc);
    await ChatConversations.updateOne(
        { _id: new (await import("mongodb")).ObjectId(conversationId) },
        { $set: { updatedAt: now } },
    );
    return { ...doc, _id: result.insertedId.toString() };
};

export const findThreadStarter = async (threadId: string, conversationId: string): Promise<ChatMessageDoc | null> => {
    const objectId = toObjectId(threadId);
    if (!objectId) return null;

    const doc = (await ChatMessageDocs.findOne({
        _id: objectId,
        conversationId,
        thread: { $exists: true },
        "thread.deletingAt": { $exists: false },
    })) as ChatMessageDoc | null;

    if (!doc) return null;
    return { ...doc, _id: doc._id?.toString() };
};

export const createThreadReply = async (
    threadId: string,
    conversationId: string,
    senderDid: string,
    payload: {
        body: string;
        attachments?: ChatAttachment[];
        replyToMessageId?: string;
    },
): Promise<ChatMessageDoc | null> => {
    const threadStarter = await findThreadStarter(threadId, conversationId);
    if (!threadStarter) return null;

    const now = new Date();
    const doc: ChatMessageDoc = {
        conversationId,
        senderDid,
        body: payload.body,
        createdAt: now,
        threadId,
        ...(payload.attachments ? { attachments: payload.attachments } : {}),
        ...(payload.replyToMessageId ? { replyToMessageId: payload.replyToMessageId } : {}),
    };
    const result = await ChatMessageDocs.insertOne(doc);
    const threadUpdate = await ChatMessageDocs.updateOne(
        {
            _id: new ObjectId(threadId),
            conversationId,
            thread: { $exists: true },
            "thread.deletingAt": { $exists: false },
        },
        {
            $set: { "thread.updatedAt": now },
            $inc: { "thread.replyCount": 1 },
        },
    );
    if (threadUpdate.matchedCount === 0) {
        await ChatMessageDocs.deleteOne({ _id: result.insertedId, conversationId, threadId });
        return null;
    }
    await ChatConversations.updateOne({ _id: new ObjectId(conversationId) }, { $set: { updatedAt: now } });
    return { ...doc, _id: result.insertedId.toString() };
};

export const sendThreadReply = async (
    threadId: string,
    conversationId: string,
    senderDid: string,
    body: string,
    replyToMessageId?: string,
): Promise<ChatMessageDoc | null> => {
    return createThreadReply(threadId, conversationId, senderDid, { body, replyToMessageId });
};

export const fetchThreadReplies = async (threadId: string, conversationId: string): Promise<ChatMessageDoc[]> => {
    const docs = await ChatMessageDocs.find({ threadId, conversationId }).sort({ createdAt: 1 }).toArray();
    return docs.map((doc) => ({ ...doc, _id: doc._id?.toString() }));
};

export const listThreadsForConversation = async (conversationId: string): Promise<ChatMessageDoc[]> => {
    const docs = await ChatMessageDocs.find({
        conversationId,
        thread: { $exists: true },
    })
        .sort({ "thread.createdAt": 1, createdAt: 1 })
        .toArray();
    return docs.map((doc) => ({ ...doc, _id: doc._id?.toString() }));
};
