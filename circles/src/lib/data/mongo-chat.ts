import { ObjectId } from "mongodb";
import { ChatRoomDisplay, Circle } from "@/models/models";
import { ChatAttachment, ChatConversation, ChatMessageDoc, ChatReaction, ChatReadState } from "@/lib/chat/mongo-types";
import {
    ChatConversations,
    ChatConversationPreferences,
    ChatMessageDocs,
    ChatReadStates,
    ChatRoomMembers,
    ChatTopicReadStates,
    Circles,
} from "./db";
import { getCircleByHandle, getCircleById, getCirclesByDids } from "./circle";
import { getKamooniSystemSender, SystemSenderIdentity } from "@/config/system-sender";
import { WelcomeMessageConfig, WELCOME_MESSAGE } from "@/config/welcome-message";
import { buildSystemMessageMetadata } from "@/lib/chat/system-messages";
import { loadAuthorizedConversationCandidates } from "@/lib/chat/conversation-access-batch";
import { buildLatestConversationMessageLookup } from "@/lib/chat/conversation-read-state";
import { compareMessagePositions, type MessagePosition } from "@/lib/chat/message-position";
import { buildThreadActivityCompareAndSetFilter } from "@/lib/chat/topic-mutations";
import { buildMessagesAfterPositionQuery } from "@/lib/chat/message-position-query";
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
import { buildReadStateV2InitializationOperation, resolveHistoricalReadBoundary } from "@/lib/chat/chat-read-state-v2";
import { resolveCanonicalDm } from "@/lib/chat/canonical-dm";

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
    return normalizeConversation(await resolveCanonicalDm(userA.did!, userB.did!, { provisional: true }));
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

export const mapConversationsToChatRoomDisplays = async (
    userDid: string,
    conversations: ChatConversation[],
    preloadedOwnerCircles?: Circle[],
): Promise<ChatRoomDisplay[]> => {
    const participantDids = Array.from(
        new Set(conversations.flatMap((conversation) => conversation.participants || [])),
    );
    const circles = participantDids.length ? await getCirclesByDids(participantDids) : [];
    const circleByDid = new Map(circles.map((circle) => [circle.did, circle]));

    const circleIdsToLoad = Array.from(
        new Set(conversations.map((conversation) => conversation.circleId).filter(Boolean) as string[]),
    );
    const loadedOwnerCircles =
        preloadedOwnerCircles ??
        (await Promise.all(circleIdsToLoad.map(getCircleById))).filter((circle): circle is Circle => !!circle);
    const circleById = new Map(loadedOwnerCircles.map((circle) => [circle._id.toString(), circle]));

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
            updatedAt: conversation.updatedAt,
        } as ChatRoomDisplay;
    });
};

/** Read-only raw candidates. Authorization and all display hydration happen at the caller. */
export const listConversationCandidatesForUser = async (
    userDid: string,
    canonicalCircleIds: string[],
    view: "active" | "archived" = "active",
): Promise<Array<ChatConversation & { _id: ObjectId }>> => {
    const conversations = (await ChatConversations.find({
        archived: { $ne: true },
        "metadata.dmProvisional": { $ne: true },
        ...(view === "archived"
            ? { type: "dm", participants: userDid, archivedBy: userDid }
            : {
                  $or: [
                      { type: "dm", participants: userDid, archivedBy: { $ne: userDid } },
                      { type: { $ne: "dm" }, participants: userDid },
                      { type: { $ne: "dm" }, circleId: { $in: canonicalCircleIds } },
                  ],
              }),
    }).toArray()) as ChatConversation[];
    return Array.from(
        new Map(
            conversations.map((conversation) => [conversation._id.toString(), normalizeConversation(conversation)]),
        ).values(),
    ) as Array<ChatConversation & { _id: ObjectId }>;
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
    const batch = await loadAuthorizedConversationCandidates(userDid, {
        findCanonicalMemberships: async () => circleIds.map((circleId) => ({ userDid, circleId })),
        findCandidates: listConversationCandidatesForUser,
        findOwningCircles: async (candidateCircleIds) => {
            const ids = candidateCircleIds.filter(ObjectId.isValid).map((id) => new ObjectId(id));
            return ids.length ? Circles.find({ _id: { $in: ids } }).toArray() : [];
        },
        findChatMemberships: async (conversationIds) => {
            const ids = conversationIds.filter(ObjectId.isValid).map((id) => new ObjectId(id));
            return conversationIds.length
                ? ChatRoomMembers.find({
                      $or: [
                          { chatRoomId: { $in: conversationIds } },
                          ...(ids.length ? [{ chatRoomId: { $in: ids } }] : []),
                      ],
                  } as any).toArray()
                : [];
        },
    });
    batch.conversations.sort((a, b) => {
        const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        return bTime - aTime;
    });
    return mapConversationsToChatRoomDisplays(userDid, batch.conversations, batch.ownerCircles as Circle[]);
};

export const fetchRecentMessages = async (conversationId: string, limit: number = 50): Promise<ChatMessageDoc[]> => {
    // Fetch the most recent messages by sorting descending, then reverse for display order
    const messages = (await ChatMessageDocs.find({ conversationId, threadId: { $exists: false } })
        .sort({ createdAt: -1, _id: -1 })
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
        .sort({ createdAt: 1, _id: 1 })
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
    let query: any = { conversationId };
    const sinceObjectId = toObjectId(sinceId);
    if (sinceObjectId) {
        const cursor = await ChatMessageDocs.findOne(
            { _id: sinceObjectId, conversationId },
            { projection: { _id: 1, createdAt: 1 } },
        );
        if (!cursor) {
            const recent = (await ChatMessageDocs.find({ conversationId })
                .sort({ createdAt: -1, _id: -1 })
                .limit(limit)
                .toArray()) as ChatMessageDoc[];
            return recent.reverse().map((message) => ({ ...message, _id: message._id?.toString() }));
        }
        query = {
            conversationId,
            ...buildMessagesAfterPositionQuery({ id: cursor._id.toString(), createdAt: cursor.createdAt }),
        };
    }

    const messages = (await ChatMessageDocs.find(query)
        .sort({ createdAt: 1, _id: 1 })
        .limit(limit)
        .toArray()) as ChatMessageDoc[];

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
        {
            $set: { updatedAt: new Date() },
            $unset: { "metadata.dmProvisional": "" },
            $pull: { archivedBy: { $ne: message.senderDid } },
        },
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
        const topicObjectId = new ObjectId(message.threadId);
        await ChatMessageDocs.updateOne(
            { _id: topicObjectId, conversationId: message.conversationId, thread: { $exists: true } },
            [
                {
                    $set: {
                        "thread.replyCount": {
                            $max: [{ $subtract: [{ $ifNull: ["$thread.replyCount", 0] }, 1] }, 0],
                        },
                    },
                },
            ],
        );
        for (let attempt = 0; attempt < 5; attempt += 1) {
            const threadStarter = (await ChatMessageDocs.findOne(
                { _id: topicObjectId, conversationId: message.conversationId, thread: { $exists: true } },
                { projection: { thread: 1 } },
            )) as ChatMessageDoc | null;
            if (!threadStarter?.thread) break;

            const latestRemainingReply = (await ChatMessageDocs.findOne(
                { conversationId: message.conversationId, threadId: message.threadId },
                { sort: { createdAt: -1, _id: -1 }, projection: { createdAt: 1 } },
            )) as Pick<ChatMessageDoc, "createdAt"> | null;
            const update = await ChatMessageDocs.updateOne(
                buildThreadActivityCompareAndSetFilter(
                    topicObjectId,
                    message.conversationId,
                    threadStarter.thread.updatedAt,
                ),
                {
                    $set: {
                        "thread.updatedAt": latestRemainingReply?.createdAt || threadStarter.thread.createdAt,
                    },
                },
            );
            if (update.modifiedCount === 1 || update.matchedCount === 1) return true;
        }
        return true;
    }
    return result.deletedCount > 0;
};

export const getTopicSortOrder = async (
    userDid: string,
    conversationId: string,
): Promise<"latest_activity" | "date_created"> => {
    const preference = await ChatConversationPreferences.findOne(
        { userDid, conversationId },
        { projection: { topicSortOrder: 1 } },
    );
    return preference?.topicSortOrder === "date_created" ? "date_created" : "latest_activity";
};

export const setTopicSortOrder = async (
    userDid: string,
    conversationId: string,
    topicSortOrder: "latest_activity" | "date_created",
): Promise<void> => {
    const now = new Date();
    await ChatConversationPreferences.updateOne(
        { userDid, conversationId },
        {
            $set: { topicSortOrder, updatedAt: now },
            $setOnInsert: { userDid, conversationId, createdAt: now },
        },
        { upsert: true },
    );
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

const advanceCursorChronologically = async ({
    identity,
    cursorField,
    proposedCursor,
    collection,
}: {
    identity: { conversationId: string; userDid: string; topicId?: string };
    cursorField: "lastReadMessageId" | "legacyLastReadMessageId";
    proposedCursor: string;
    collection: typeof ChatReadStates | typeof ChatTopicReadStates;
}): Promise<void> => {
    const proposedObjectId = toObjectId(proposedCursor);
    if (!proposedObjectId) throw new Error("Invalid chat read cursor");
    const proposedMessage = await ChatMessageDocs.findOne(
        { _id: proposedObjectId, conversationId: identity.conversationId },
        { projection: { _id: 1, createdAt: 1 } },
    );
    if (!proposedMessage) throw new Error("Chat read cursor message not found");
    const proposedPosition: MessagePosition = {
        id: proposedMessage._id.toString(),
        createdAt: proposedMessage.createdAt,
    };

    for (let attempt = 0; attempt < 5; attempt += 1) {
        const state = (await collection.findOne(identity)) as Record<string, any> | null;
        if (!state) throw new Error("Chat read state not found");
        const currentCursor = normalizeObjectIdHex(state[cursorField]);
        if (currentCursor === proposedPosition.id) return;
        if (currentCursor) {
            const currentMessage = await ChatMessageDocs.findOne(
                { _id: new ObjectId(currentCursor), conversationId: identity.conversationId },
                { projection: { _id: 1, createdAt: 1 } },
            );
            if (!currentMessage) {
                console.warn("Chat read cursor message is missing; refusing to advance an unresolved boundary", {
                    conversationId: identity.conversationId,
                    topicId: identity.topicId,
                });
                throw new Error("Cannot advance an unresolved chat read cursor");
            }
            if (
                compareMessagePositions(proposedPosition, {
                    id: currentMessage._id.toString(),
                    createdAt: currentMessage.createdAt,
                }) <= 0
            ) {
                return;
            }
        }
        const result = await collection.updateOne(
            { ...identity, [cursorField]: state[cursorField] ?? null } as any,
            { $set: { [cursorField]: proposedPosition.id, updatedAt: new Date() } } as any,
        );
        if (result.modifiedCount === 1) return;
    }
    throw new Error("Chat read cursor advancement did not stabilize");
};

export const markConversationRead = async (
    userDid: string,
    conversationId: string,
    lastReadMessageId: string | null,
): Promise<void> => {
    await ensureChatReadStateV2(userDid, conversationId);
    const identity = { conversationId, userDid };
    const now = new Date();
    await ChatReadStates.updateOne(
        identity,
        {
            $setOnInsert: {
                ...identity,
                lastReadMessageId: null,
                legacyLastReadMessageId: null,
                topicFallbackMessageId: null,
                readStateVersion: CHAT_READ_STATE_VERSION,
                readStateMigratedAt: now,
                updatedAt: now,
            },
        },
        { upsert: true },
    );
    if (!lastReadMessageId) {
        await ChatReadStates.updateOne(identity, { $set: { updatedAt: now } });
        return;
    }
    await advanceCursorChronologically({
        identity,
        cursorField: "legacyLastReadMessageId",
        proposedCursor: lastReadMessageId,
        collection: ChatReadStates,
    });
};

const getHistoricalReadBoundary = async (conversationId: string, readState: ChatReadState): Promise<string | null> => {
    return resolveHistoricalReadBoundary(readState, async (updatedAt) => {
        const nextSecond = ObjectId.createFromTime(Math.floor(updatedAt.getTime() / 1000) + 1);
        const latestAtHistoricalRead = await ChatMessageDocs.findOne(
            {
                conversationId,
                $or: [{ createdAt: { $lte: updatedAt } }, { createdAt: { $exists: false }, _id: { $lt: nextSecond } }],
            },
            { sort: { createdAt: -1, _id: -1 }, projection: { _id: 1 } },
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
        { sort: { createdAt: -1, _id: -1 }, projection: { _id: 1 } },
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
            $setOnInsert: { ...identity, lastReadMessageId: null, updatedAt: new Date() },
        },
        { upsert: true },
    );
    await advanceCursorChronologically({
        identity,
        cursorField: "lastReadMessageId",
        proposedCursor: normalizedCursor,
        collection: ChatTopicReadStates,
    });
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
    const boundaryIds = Array.from(
        new Set(
            normalizedTopicIds
                .map((topicId) =>
                    resolveTopicReadBoundary({
                        topicId,
                        explicitLastReadMessageId: explicitByTopic.has(topicId)
                            ? explicitByTopic.get(topicId)
                            : undefined,
                        conversationFallbackMessageId: migrationFallback,
                    }),
                )
                .filter((value): value is string => !!normalizeObjectIdHex(value)),
        ),
    );
    const boundaryMessages = boundaryIds.length
        ? await ChatMessageDocs.find(
              { conversationId, _id: { $in: boundaryIds.map((id) => new ObjectId(id)) } },
              { projection: { _id: 1, createdAt: 1 } },
          ).toArray()
        : [];
    const boundaryById = new Map(boundaryMessages.map((message) => [message._id.toString(), message]));
    const topicClauses = normalizedTopicIds.map((topicId) => {
        const boundary = resolveTopicReadBoundary({
            topicId,
            explicitLastReadMessageId: explicitByTopic.has(topicId) ? explicitByTopic.get(topicId) : undefined,
            conversationFallbackMessageId: migrationFallback,
        });
        const scope = includeStarters
            ? { $or: [{ _id: toObjectId(topicId), thread: { $exists: true } }, { threadId: topicId }] }
            : { threadId: topicId };
        const normalizedBoundary = normalizeObjectIdHex(boundary);
        if (!normalizedBoundary) return scope;
        const boundaryMessage = boundaryById.get(normalizedBoundary);
        const afterBoundary = buildMessagesAfterPositionQuery({
            id: normalizedBoundary,
            createdAt: boundaryMessage?.createdAt,
        });
        return { $and: [scope, afterBoundary] };
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
    const normalizedBoundary = normalizeObjectIdHex(readState?.legacyLastReadMessageId);
    const boundaryMessage = normalizedBoundary
        ? await ChatMessageDocs.findOne(
              { conversationId, _id: new ObjectId(normalizedBoundary) },
              { projection: { _id: 1, createdAt: 1 } },
          )
        : null;
    const legacyQuery: Record<string, any> = {
        conversationId,
        senderDid: { $ne: userDid },
        threadId: { $exists: false },
        thread: { $exists: false },
        ...(normalizedBoundary
            ? buildMessagesAfterPositionQuery({ id: normalizedBoundary, createdAt: boundaryMessage?.createdAt })
            : {}),
    };
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
    metadata?: Pick<ChatMessageDoc, "source" | "version"> & { lifecycleEventId?: string },
    messageId?: string,
    dependencies: {
        insertThread: (doc: any) => Promise<{ insertedId: ObjectId }>;
        findThread: (query: any) => Promise<any>;
        updateConversation: (conversationId: ObjectId, updatedAt: Date) => Promise<void>;
    } = {
        insertThread: (doc) => ChatMessageDocs.insertOne(doc),
        findThread: (query) => ChatMessageDocs.findOne(query),
        updateConversation: async (id, updatedAt) => {
            await ChatConversations.updateOne(
                { _id: id },
                { $set: { updatedAt }, $pull: { archivedBy: { $ne: senderDid } } },
            );
        },
    },
): Promise<ChatMessageDoc | null> => {
    const now = new Date();
    const doc: ChatMessageDoc & { lifecycleEventId?: string } = {
        ...(messageId ? { _id: new ObjectId(messageId) } : {}),
        conversationId,
        senderDid,
        body,
        createdAt: now,
        ...metadata,
        thread: {
            title,
            hashtags,
            createdAt: now,
            updatedAt: now,
            replyCount: 0,
        },
    };
    let createdId!: ObjectId;
    let recovered: ChatMessageDoc | null = null;
    try {
        const result = await dependencies.insertThread(doc);
        createdId = result.insertedId;
    } catch (error: any) {
        if (!messageId || error?.code !== 11000) throw error;
        const expectedTitle = title;
        const existing = await dependencies.findThread({
            _id: new ObjectId(messageId),
            conversationId,
            lifecycleEventId: metadata?.lifecycleEventId,
            source: "circle_moderation",
            version: "v1",
            senderDid,
            "thread.title": expectedTitle,
            thread: { $exists: true },
        } as any);
        if (!existing) throw error;
        recovered = existing as ChatMessageDoc;
        createdId = existing._id as ObjectId;
    }
    await dependencies.updateConversation(new ObjectId(conversationId), now);
    return recovered
        ? ({ ...recovered, _id: recovered._id?.toString() } as ChatMessageDoc)
        : { ...doc, _id: createdId.toString() };
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
        submissionId?: string;
    },
): Promise<ChatMessageDoc | null> => {
    const matchesSubmission = (message: ChatMessageDoc): boolean =>
        message.conversationId === conversationId &&
        message.threadId === threadId &&
        message.senderDid === senderDid &&
        message.body === payload.body &&
        message.replyToMessageId === payload.replyToMessageId;
    const findExistingSubmission = async (): Promise<ChatMessageDoc | null> => {
        if (!payload.submissionId) return null;
        const existing = (await ChatMessageDocs.findOne({
            senderDid,
            submissionId: payload.submissionId,
        })) as ChatMessageDoc | null;
        if (!existing) return null;
        if (!matchesSubmission(existing)) throw new Error("Reply submission id was already used for another message");
        return { ...existing, _id: existing._id?.toString() };
    };

    const existingSubmission = await findExistingSubmission();
    if (existingSubmission) return existingSubmission;

    const threadStarter = await findThreadStarter(threadId, conversationId);
    if (!threadStarter) return null;

    const now = new Date();
    const doc: ChatMessageDoc = {
        conversationId,
        senderDid,
        body: payload.body,
        createdAt: now,
        threadId,
        ...(payload.submissionId ? { submissionId: payload.submissionId } : {}),
        ...(payload.attachments ? { attachments: payload.attachments } : {}),
        ...(payload.replyToMessageId ? { replyToMessageId: payload.replyToMessageId } : {}),
    };
    let result;
    try {
        result = await ChatMessageDocs.insertOne(doc);
    } catch (error: any) {
        if (error?.code !== 11000 || !payload.submissionId) throw error;
        const recovered = await findExistingSubmission();
        if (!recovered) throw error;
        return recovered;
    }
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
    await ChatConversations.updateOne(
        { _id: new ObjectId(conversationId) },
        { $set: { updatedAt: now }, $pull: { archivedBy: { $ne: senderDid } } },
    );
    return { ...doc, _id: result.insertedId.toString() };
};

export const sendThreadReply = async (
    threadId: string,
    conversationId: string,
    senderDid: string,
    body: string,
    replyToMessageId?: string,
    submissionId?: string,
): Promise<ChatMessageDoc | null> => {
    return createThreadReply(threadId, conversationId, senderDid, { body, replyToMessageId, submissionId });
};

export const fetchThreadReplies = async (threadId: string, conversationId: string): Promise<ChatMessageDoc[]> => {
    const docs = await ChatMessageDocs.find({ threadId, conversationId }).sort({ createdAt: 1, _id: 1 }).toArray();
    return docs.map((doc) => ({ ...doc, _id: doc._id?.toString() }));
};

export const listThreadsForConversation = async (conversationId: string): Promise<ChatMessageDoc[]> => {
    const docs = await ChatMessageDocs.find({
        conversationId,
        thread: { $exists: true },
    })
        .sort({ "thread.createdAt": 1, createdAt: 1, _id: 1 })
        .toArray();
    return docs.map((doc) => ({ ...doc, _id: doc._id?.toString() }));
};
