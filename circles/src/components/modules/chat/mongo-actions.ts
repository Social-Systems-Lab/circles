"use server";

import { ObjectId } from "mongodb";
import type { ChatAttachment, ChatMessageDoc } from "@/lib/chat/mongo-types";
import { ChatMessage, ChatRoomDisplay, Circle } from "@/models/models";
import {
    createConversation,
    createIdempotentMessage,
    createMessage,
    createThreadReply,
    countLegacyLooseMessages,
    deleteTopic,
    deleteMessage,
    fetchLegacyLooseMessages,
    fetchMessagesSince,
    fetchRecentMessages,
    fetchTopicStarters,
    findConversationById,
    findThreadStarter,
    PersistedChatMessageActivityError,
    refreshPersistedMessageActivity,
    getLatestLegacyMessageIdForConversation,
    findOrCreateDmConversation,
    getUnreadCountsForUser,
    getTopicUnreadCountsForUser,
    getTopicSortOrder,
    getConversationNotificationsMuted,
    getConversationNotificationMutePreferences,
    getLegacyUnreadCountForUser,
    listConversationCandidatesForUser,
    mapConversationsToChatRoomDisplays,
    mapConversationToChatRoomDisplay,
    markConversationRead,
    markTopicRead,
    setTopicSortOrder,
    setConversationNotificationsMuted,
    toggleReaction,
    updateMessage,
    updateTopic,
    validateTopicReadCursor,
} from "@/lib/data/mongo-chat";
import { ChatConversations, ChatMessageDocs, ChatRoomMembers, ChatRooms, Circles, Members } from "@/lib/data/db";
import { getCircleByDid, getCircleByHandle, getCircleById, getCirclesByDids } from "@/lib/data/circle";
import { getUserPrivate } from "@/lib/data/user";
import { sendNotifications } from "@/lib/data/notifications";
import { deleteFile, saveFile } from "@/lib/data/storage";
import { cleanupUploadedFiles } from "@/lib/data/post-upload-rollback";
import { getAuthenticatedUserDid as getProductionAuthenticatedUserDid } from "@/lib/auth/auth";
import { normalizeObjectIdHex, sumConversationUnreadCounts } from "@/lib/chat/topic-read-state";
import { WELCOME_MESSAGE, isSystemMessageSource } from "@/config/welcome-message";
import { normalizeSystemMessageMetadata } from "@/lib/chat/system-messages";
import { getSkillLabelByHandle } from "@/lib/data/skills";
import { canParticipate, getParticipationRequiredMessage } from "@/lib/profile-completion";
import { getDmEligibility } from "@/lib/data/relationships";
import { assertCircleWritesAllowed, canReadCircleByLifecycle } from "@/lib/data/circle-lifecycle-policy";
import {
    buildConversationScopedReplyFilter,
    CHAT_UNAVAILABLE_MESSAGE,
    evaluateConversationAccess,
} from "@/lib/chat/conversation-access-policy";
import { canReadCircle } from "@/lib/data/circle-visibility-policy";
import { loadAuthorizedConversationCandidates } from "@/lib/chat/conversation-access-batch";
import { authorizeCircleChatEntry } from "@/lib/chat/circle-chat-entry-orchestration";
import { getChatActionContext, getChatActionViewerDid, observeChatActionEffect } from "@/lib/chat/chat-action-context";
import { getCircleModerationStarterAuthor } from "@/lib/chat/moderation-presentation";
import {
    CIRCLE_MODERATION_SOURCE,
    getChatNotificationLocation,
    getParticipantNotificationDids,
    isPrivateParticipantNotificationConversation,
    PARTICIPANT_MESSAGE_NOTIFICATION_TYPE,
    resolveChatMentionRecipientDids,
} from "@/lib/chat/participant-notifications";
import { buildChatMentionNotificationMessage } from "@/lib/chat/notification-presentation";
import { acknowledgeTopicPmNotifications } from "@/lib/chat/pm-notification-read";

const getAuthenticatedUserDid = () => getChatActionViewerDid(getProductionAuthenticatedUserDid);

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

const isUploadedFileLike = (value: FormDataEntryValue | null): value is File => {
    return (
        !!value &&
        typeof value !== "string" &&
        typeof value.arrayBuffer === "function" &&
        typeof value.size === "number"
    );
};

const ensureParticipatingMessagingUser = async (userDid: string, action: string): Promise<string | null> => {
    const user = getChatActionContext()?.findMessagingUser
        ? await getChatActionContext()!.findMessagingUser!(userDid)
        : await Circles.findOne(
              { did: userDid },
              {
                  projection: {
                      circleType: 1,
                      picture: 1,
                      description: 1,
                      content: 1,
                      communityGuidelinesAcceptance: 1,
                      isEmailVerified: 1,
                      isAdmin: 1,
                  },
              },
          );
    if (!canParticipate(user)) {
        return getParticipationRequiredMessage(action, user);
    }
    return null;
};

const ensureInteractiveMessagingUser = async (userDid: string, action: string): Promise<string | null> => {
    return ensureParticipatingMessagingUser(userDid, action);
};

const CIRCLE_CONTACT_SOURCE = "circle_contact";
const CIRCLE_CONTACT_VERSION = "v1";
type CircleContactType = "offer_help" | "ask_question";

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
    }) as Circle;

const resolveChatMentionRecipients = async ({
    conversation,
    senderDid,
    messageBody,
}: {
    conversation: any;
    senderDid: string;
    messageBody: string;
}) => {
    const mentionedDids = await resolveChatMentionRecipientDids(conversation, senderDid, messageBody);
    return (await Promise.all(mentionedDids.map((recipientDid) => getUserPrivate(recipientDid)))).filter(
        (recipient): recipient is any => !!recipient?.did,
    );
};

export const sendConversationMessageNotifications = async ({
    conversationId,
    conversation,
    senderDid,
    messageBody,
    messageId,
    topicId,
    idempotencyKey,
}: {
    conversationId: string;
    conversation: any;
    senderDid: string;
    messageBody: string;
    messageId?: string;
    topicId?: string;
    idempotencyKey?: string;
}) => {
    const isDirectMessage = conversation?.type === "dm";
    const isCircleContact = conversation?.metadata?.source === CIRCLE_CONTACT_SOURCE;
    const isCircleModeration = conversation?.metadata?.source === CIRCLE_MODERATION_SOURCE;
    const sender = await getCircleByDid(senderDid);
    if (!sender?.did) {
        return;
    }
    const circle = conversation?.circleId ? await getCircleById(conversation.circleId) : undefined;
    const mentionRecipients = await resolveChatMentionRecipients({
        conversation,
        senderDid,
        messageBody,
    });
    const mentionRecipientDids = new Set(mentionRecipients.map((recipient) => recipient.did));

    if (isPrivateParticipantNotificationConversation(conversation)) {
        const recipientDids = getParticipantNotificationDids(conversation, senderDid, mentionRecipientDids);

        const recipients = (
            await Promise.all(recipientDids.map((recipientDid) => getUserPrivate(recipientDid)))
        ).filter((recipient): recipient is any => !!recipient?.did);

        if (recipients.length) {
            await sendNotifications(
                PARTICIPANT_MESSAGE_NOTIFICATION_TYPE,
                recipients,
                {
                    ...getChatNotificationLocation(conversationId, topicId),
                    ...(messageId ? { messageId } : {}),
                    user: sender,
                    circle: isCircleContact ? circle : undefined,
                    contactType: conversation?.metadata?.contactType,
                    conversationName: isCircleModeration ? "Circle moderation" : conversation?.name,
                    messagePreview: isCircleModeration
                        ? "A Circle moderation message is ready for review."
                        : messageBody,
                },
                idempotencyKey ? { idempotencyKey } : undefined,
            );
        }
    }

    if (mentionRecipients.length) {
        const topic = topicId ? await findThreadStarter(topicId, conversationId) : null;
        const topicTitle = topic?.thread?.title?.trim() || undefined;
        await sendNotifications(
            "chat_mention",
            mentionRecipients,
            {
                ...getChatNotificationLocation(conversationId, topicId),
                user: sender,
                circle,
                conversationName: conversation?.name,
                topicTitle,
                messageBody: buildChatMentionNotificationMessage(sender.name, topicTitle),
                messagePreview: messageBody,
            },
            idempotencyKey ? { idempotencyKey } : undefined,
        );
    }

    if (!isDirectMessage || !messageId) {
        return;
    }
};

export const resolveMongoConversationAccess = async (
    conversationId: string,
    userDid: string,
    intent: "read" | "write" = "read",
) => {
    const context = getChatActionContext();
    let conversation = context?.findConversation
        ? await context.findConversation(conversationId)
        : await findConversationById(conversationId);

    // If conversationId is actually a handle (e.g. "dm-..."), try resolving by handle.
    if (!conversation && !context?.findConversation) {
        const { ChatConversations } = await import("@/lib/data/db");
        conversation = await ChatConversations.findOne({ handle: conversationId });
    }

    if (!conversation) {
        return { ok: false, message: CHAT_UNAVAILABLE_MESSAGE };
    }

    const unauthorized = { ok: false as const, message: CHAT_UNAVAILABLE_MESSAGE };
    const circleId = typeof conversation.circleId === "string" ? conversation.circleId : undefined;
    const ownerCircle =
        circleId && ObjectId.isValid(circleId)
            ? context?.findCircle
                ? await context.findCircle(circleId)
                : await getCircleById(circleId)
            : null;
    const canonicalMember = circleId
        ? Boolean(
              context?.findCanonicalMember
                  ? await context.findCanonicalMember(userDid, circleId)
                  : await Members.findOne({ userDid, circleId }, { projection: { _id: 1 } }),
          )
        : false;
    if (ownerCircle && intent === "read" && !canReadCircleByLifecycle(ownerCircle)) return unauthorized;

    // Non-DM: enforce strict membership in ChatRoomMembers
    const chatRoomId = String((conversation as any)._id);
    const membershipQuery: any = { userDid, chatRoomId };
    // Handle both string and ObjectId-stored chatRoomId values
    if (ObjectId.isValid(chatRoomId)) {
        membershipQuery.$or = [
            { userDid, chatRoomId },
            { userDid, chatRoomId: new ObjectId(chatRoomId) },
        ];
        delete membershipQuery.chatRoomId;
    }

    const membership: any =
        conversation.type === "dm"
            ? null
            : context?.findChatMember
              ? await context.findChatMember(userDid, chatRoomId)
              : await ChatRoomMembers.findOne(membershipQuery);
    const allowed = evaluateConversationAccess({
        conversation,
        viewerDid: userDid,
        intent,
        ownerCircle,
        canonicalMember,
        chatMember: isActiveGroupMembership(membership),
    });
    if (!allowed) return unauthorized;

    return { ok: true, conversation };
};

export const resolveMongoConversationAccessBatch = async (
    conversationIds: string[],
    userDid: string,
    intent: "read" | "write" = "read",
): Promise<Set<string>> => {
    const uniqueIds = Array.from(new Set(conversationIds.filter(Boolean)));
    if (!uniqueIds.length) return new Set();
    if (getChatActionContext()?.findConversation) {
        const checks = await Promise.all(
            uniqueIds.map(async (id) => ({ id, access: await resolveMongoConversationAccess(id, userDid, intent) })),
        );
        return new Set(
            checks
                .filter(({ access }) => access.ok)
                .flatMap(({ id, access }) => [id, access.conversation?._id?.toString?.()].filter(Boolean) as string[]),
        );
    }
    const objectIds = uniqueIds.filter(ObjectId.isValid).map((id) => new ObjectId(id));
    const conversations = await ChatConversations.find({
        archived: { $ne: true },
        $or: [{ _id: { $in: objectIds } }, { handle: { $in: uniqueIds } }],
    }).toArray();
    const circleIds = Array.from(
        new Set(
            conversations
                .map((conversation: any) => conversation.circleId)
                .filter((id): id is string => typeof id === "string"),
        ),
    );
    const circleObjectIds = circleIds.filter(ObjectId.isValid).map((id) => new ObjectId(id));
    const [circles, canonicalRows, chatRows] = await Promise.all([
        circleObjectIds.length ? Circles.find({ _id: { $in: circleObjectIds } }).toArray() : Promise.resolve([]),
        circleIds.length
            ? Members.find({ userDid, circleId: { $in: circleIds } }, { projection: { circleId: 1 } }).toArray()
            : Promise.resolve([]),
        ChatRoomMembers.find(
            {
                userDid,
                $or: [
                    { chatRoomId: { $in: uniqueIds } },
                    ...(objectIds.length ? [{ chatRoomId: { $in: objectIds } }] : []),
                ],
            } as any,
            { projection: { chatRoomId: 1, status: 1, active: 1, isActive: 1 } },
        ).toArray(),
    ]);
    const circleById = new Map(circles.map((circle: any) => [circle._id.toString(), circle]));
    const canonicalIds = new Set(canonicalRows.map((row: any) => row.circleId));
    const activeChatIds = new Set(
        chatRows
            .filter(isActiveGroupMembership)
            .map((row: any) => row.chatRoomId?.toString?.() || String(row.chatRoomId)),
    );
    const allowed = new Set<string>();
    for (const conversation of conversations) {
        const id = conversation._id.toString();
        if (
            evaluateConversationAccess({
                conversation,
                viewerDid: userDid,
                intent,
                ownerCircle: typeof conversation.circleId === "string" ? circleById.get(conversation.circleId) : null,
                canonicalMember: typeof conversation.circleId === "string" && canonicalIds.has(conversation.circleId),
                chatMember: activeChatIds.has(id),
            })
        ) {
            allowed.add(id);
            if (conversation.handle) allowed.add(conversation.handle);
        }
    }
    return allowed;
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

    const replyTargetDoc = getChatActionContext()?.findMessage
        ? await getChatActionContext()!.findMessage!(replyToMessageId)
        : await ChatMessageDocs.findOne(
              {
                  _id: new ObjectId(replyToMessageId),
                  conversationId,
              },
              {
                  projection: { conversationId: 1, source: 1, version: 1, system: 1 },
              },
          );

    if (!replyTargetDoc || replyTargetDoc.conversationId !== conversationId) {
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

export const listChatRoomsAction = async (
    view: "active" | "archived" = "active",
): Promise<{
    success: boolean;
    rooms?: ChatRoomDisplay[];
    message?: string;
}> => {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "You need to be logged in to view chats" };
    }

    try {
        // Why this broke: delegating through listChatRoomsForUser used provider branching.
        // A provider mismatch could hide Mongo DMs in production.
        const context = getChatActionContext();
        const batch = await loadAuthorizedConversationCandidates(userDid, {
            findCanonicalMemberships: async (did) =>
                context?.findCanonicalMemberships
                    ? context.findCanonicalMemberships(did)
                    : Members.find({ userDid: did }).toArray(),
            findCandidates: context?.findCandidates
                ? context.findCandidates
                : (did, circleIds) => listConversationCandidatesForUser(did, circleIds, view),
            findOwningCircles: async (circleIds) => {
                if (context?.findOwningCircles) return context.findOwningCircles(circleIds);
                const ids = circleIds.filter(ObjectId.isValid).map((id) => new ObjectId(id));
                return ids.length
                    ? Circles.find(
                          { _id: { $in: ids } },
                          { projection: { _id: 1, did: 1, circleType: 1, visibility: 1, moderationStatus: 1 } },
                      ).toArray()
                    : [];
            },
            findChatMemberships: async (conversationIds) => {
                if (context?.findChatMemberships) return context.findChatMemberships(conversationIds);
                const ids = conversationIds.filter(ObjectId.isValid).map((id) => new ObjectId(id));
                return conversationIds.length
                    ? ChatRoomMembers.find(
                          {
                              $or: [
                                  { chatRoomId: { $in: conversationIds } },
                                  ...(ids.length ? [{ chatRoomId: { $in: ids } }] : []),
                              ],
                          } as any,
                          { projection: { chatRoomId: 1, userDid: 1, status: 1, active: 1, isActive: 1 } },
                      ).toArray()
                    : [];
            },
        });
        const authorizedConversations = batch.conversations;
        const circles = batch.ownerCircles;
        const candidateMemberships = batch.memberships;
        authorizedConversations.sort(
            (a, b) =>
                (b.updatedAt ? new Date(b.updatedAt).getTime() : 0) -
                (a.updatedAt ? new Date(a.updatedAt).getTime() : 0),
        );
        // Participant and Circle metadata hydration happens only after canonical authorization.
        const rooms = context?.mapConversations
            ? await context.mapConversations(userDid, authorizedConversations, circles)
            : await mapConversationsToChatRoomDisplays(userDid, authorizedConversations, circles as Circle[]);
        const groupRoomIds = rooms
            .filter((room) => !room.isDirect && typeof room._id === "string" && room._id.length > 0)
            .map((room) => room._id as string);
        const groupRoomObjectIds = groupRoomIds.filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id));

        const groupRooms = groupRoomObjectIds.length
            ? await ChatRooms.find(
                  { _id: { $in: groupRoomObjectIds } },
                  { projection: { _id: 1, picture: 1 } },
              ).toArray()
            : [];
        const groupRoomById = new Map(groupRooms.map((room: any) => [room._id.toString(), room]));

        const authorizedGroupRoomIds = new Set(groupRoomIds);
        const memberships = candidateMemberships.filter((membership: any) => {
            const id = membership.chatRoomId?.toString?.() || String(membership.chatRoomId);
            return authorizedGroupRoomIds.has(id);
        });

        const groupMemberCounts = new Map<string, number>();
        for (const membership of memberships) {
            if (!isActiveGroupMembership(membership)) continue;
            const rawChatRoomId = (membership as any).chatRoomId;
            const chatRoomId = typeof rawChatRoomId === "string" ? rawChatRoomId : rawChatRoomId?.toString?.();
            if (!chatRoomId) continue;
            groupMemberCounts.set(chatRoomId, (groupMemberCounts.get(chatRoomId) || 0) + 1);
        }

        const conversationIds = rooms.map((room) => room._id || room.handle).filter(Boolean) as string[];
        const unreadCounts = context?.getUnreadCounts
            ? await context.getUnreadCounts(userDid, conversationIds)
            : await getUnreadCountsForUser(userDid, conversationIds);
        let mutePreferences: Record<string, boolean> = {};
        let mutePreferencesAvailable = true;
        try {
            mutePreferences = context?.getConversationMutePreferences
                ? await context.getConversationMutePreferences(userDid, conversationIds)
                : await getConversationNotificationMutePreferences(userDid, conversationIds);
        } catch (error) {
            mutePreferencesAvailable = false;
            console.error("Failed to load conversation mute preferences", {
                event: "chat_mute_preference_batch_lookup_failed",
                conversationCount: conversationIds.length,
                errorName: error instanceof Error ? error.name : "UnknownError",
            });
        }
        const roomsWithUnread = rooms.map((room) => ({
            ...room,
            picture:
                room.picture ||
                (!room.isDirect && typeof room._id === "string"
                    ? (groupRoomById.get(room._id)?.picture as any)
                    : undefined),
            memberCount:
                !room.isDirect && typeof room._id === "string" ? groupMemberCounts.get(room._id) || 0 : undefined,
            unreadCount: room._id || room.handle ? unreadCounts[(room._id || room.handle) as string] || 0 : 0,
            notificationsMuted:
                mutePreferencesAvailable && typeof room._id === "string"
                    ? mutePreferences[room._id] === true
                    : undefined,
            notificationsMutePreferenceAvailable: mutePreferencesAvailable,
        }));
        return { success: true, rooms: roomsWithUnread };
    } catch (error) {
        console.error("❌ Error listing chat rooms:", error);
        return { success: false, message: error instanceof Error ? error.message : "Failed to load chats" };
    }
};

export const getChatRoomAction = async (
    conversationId: string,
    view: "active" | "archived" = "active",
): Promise<{ success: boolean; room?: ChatRoomDisplay; message?: string }> => {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) return { success: false, message: "You need to be logged in to view chats" };

    const access = await resolveMongoConversationAccess(conversationId, userDid, "read");
    if (!access.ok || !access.conversation) return { success: false, message: access.message };

    const conversation = access.conversation as any;
    const archivedByViewer = Array.isArray(conversation.archivedBy) && conversation.archivedBy.includes(userDid);
    const isUnavailable =
        conversation.archived === true ||
        conversation.metadata?.dmProvisional === true ||
        (view === "archived"
            ? conversation.type !== "dm" || !archivedByViewer
            : conversation.type === "dm" && archivedByViewer);
    if (isUnavailable) return { success: false, message: CHAT_UNAVAILABLE_MESSAGE };

    try {
        const context = getChatActionContext();
        const rooms = context?.mapConversations
            ? await context.mapConversations(userDid, [conversation], [])
            : [await mapConversationToChatRoomDisplay(userDid, conversation)].filter(
                  (room): room is ChatRoomDisplay => !!room,
              );
        const room = rooms[0];
        return room ? { success: true, room } : { success: false, message: CHAT_UNAVAILABLE_MESSAGE };
    } catch (error) {
        console.error("Failed to load chat room:", error);
        return { success: false, message: CHAT_UNAVAILABLE_MESSAGE };
    }
};

const setDmArchivedForCurrentUser = async (
    conversationId: string,
    archived: boolean,
): Promise<{ success: boolean; message?: string }> => {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) return { success: false, message: "Not authenticated" };
    if (!ObjectId.isValid(conversationId)) return { success: false, message: CHAT_UNAVAILABLE_MESSAGE };

    try {
        observeChatActionEffect("conversation-archive");
        const context = getChatActionContext();
        const result = context?.updateConversationArchive
            ? await context.updateConversationArchive(conversationId, userDid, archived)
            : await ChatConversations.updateOne(
                  {
                      _id: new ObjectId(conversationId),
                      type: "dm",
                      participants: userDid,
                      archived: { $ne: true },
                      "metadata.dmProvisional": { $ne: true },
                  },
                  archived ? { $addToSet: { archivedBy: userDid } } : { $pull: { archivedBy: userDid } },
              );
        if (result.matchedCount !== 1) return { success: false, message: CHAT_UNAVAILABLE_MESSAGE };
        return { success: true };
    } catch (error) {
        console.error(`Failed to ${archived ? "archive" : "unarchive"} direct message:`, error);
        return { success: false, message: `Failed to ${archived ? "archive" : "unarchive"} conversation` };
    }
};

export const archiveDmConversationAction = async (conversationId: string) =>
    setDmArchivedForCurrentUser(conversationId, true);

export const unarchiveDmConversationAction = async (conversationId: string) =>
    setDmArchivedForCurrentUser(conversationId, false);

export const getConversationMutePreferenceAction = async (
    conversationId: string,
): Promise<{ success: boolean; muted?: boolean; message?: string }> => {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) return { success: false, message: "Not authenticated" };
    const access = await resolveMongoConversationAccess(conversationId, userDid, "read");
    if (!access.ok) return { success: false, message: access.message };
    const muted = getChatActionContext()?.getConversationNotificationsMuted
        ? await getChatActionContext()!.getConversationNotificationsMuted!(userDid, conversationId)
        : await getConversationNotificationsMuted(userDid, conversationId);
    return { success: true, muted };
};

export const setConversationMutePreferenceAction = async (
    conversationId: string,
    muted: boolean,
): Promise<{ success: boolean; message?: string }> => {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) return { success: false, message: "Not authenticated" };
    if (typeof muted !== "boolean") return { success: false, message: "Invalid mute preference" };
    const access = await resolveMongoConversationAccess(conversationId, userDid, "read");
    if (!access.ok) return { success: false, message: access.message };
    if (getChatActionContext()?.setConversationNotificationsMuted) {
        await getChatActionContext()!.setConversationNotificationsMuted!(userDid, conversationId, muted);
    } else {
        await setConversationNotificationsMuted(userDid, conversationId, muted);
    }
    return { success: true };
};

export const fetchRecentMessagesAction = async (
    conversationId: string,
    limit: number = 50,
): Promise<{ success: boolean; messages?: ChatMessage[]; oldestId?: string; message?: string }> => {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "You need to be logged in to fetch messages" };
    }

    const access = await resolveMongoConversationAccess(conversationId, userDid, "read");
    if (!access.ok) {
        return { success: false, message: access.message };
    }

    try {
        const docs = getChatActionContext()?.fetchRecentMessages
            ? await getChatActionContext()!.fetchRecentMessages!(conversationId, limit)
            : await fetchRecentMessages(conversationId, limit);
        if (!docs.length) {
            return { success: true, messages: [], oldestId: undefined };
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
            ? ((await ChatMessageDocs.find(
                  buildConversationScopedReplyFilter(conversationId, replyObjectIds) as any,
              ).toArray()) as any[])
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
            const presentedAuthor = getCircleModerationStarterAuthor({
                conversationSource: conversationMetadata?.source,
                messageSource: doc.source,
                messageVersion: doc.version,
                senderDid: doc.senderDid,
                realAuthor: senderByDid.get(doc.senderDid),
            });
            const author =
                (presentedAuthor
                    ? presentedAuthor
                    : shouldUseSystemTemplateAuthor
                      ? fallbackSystemAuthor
                      : senderByDid.get(doc.senderDid)) ||
                (isTemplateSystemMessage
                    ? fallbackSystemAuthor
                    : ({
                          _id: doc.senderDid,
                          name: doc.senderDid,
                          picture: { url: "/placeholder.svg" },
                      } as Circle));

            const replyDoc = doc.replyToMessageId ? replyById.get(doc.replyToMessageId) : undefined;
            const replyAuthor = replyDoc
                ? getCircleModerationStarterAuthor({
                      conversationSource: conversationMetadata?.source,
                      messageSource: replyDoc.source,
                      messageVersion: replyDoc.version,
                      senderDid: replyDoc.senderDid,
                      realAuthor: senderByDid.get(replyDoc.senderDid),
                  }) || { _id: replyDoc.senderDid, name: replyDoc.senderDid }
                : undefined;
            const normalizedReplyAttachments = Array.isArray(replyDoc?.attachments)
                ? replyDoc.attachments.map((attachment: ChatAttachment) => ({
                      ...attachment,
                      url: normalizeMediaUrl(attachment?.url) || attachment?.url,
                  }))
                : replyDoc?.attachments;

            const reactions = (doc.reactions || []).reduce((acc: Record<string, any[]>, reaction: any) => {
                if (!acc[reaction.emoji]) acc[reaction.emoji] = [];
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
                content: { msgtype: "m.text", body: doc.body },
                createdBy: doc.senderDid,
                createdAt: doc.createdAt,
                author,
                reactions,
                replyTo: replyDoc
                    ? {
                          id: replyDoc._id,
                          author: replyAuthor,
                          content: { msgtype: "m.text", body: replyDoc.body },
                          attachments: normalizedReplyAttachments,
                      }
                    : undefined,
            };

            const normalizedAttachments = Array.isArray(doc.attachments)
                ? doc.attachments.map((attachment: ChatAttachment) => ({
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
            (message as any).thread = (doc as any).thread;
            (message as any).threadId = (doc as any).threadId;

            return message;
        });

        const oldestId = docs[0]?._id?.toString();
        return { success: true, messages, oldestId };
    } catch (error) {
        console.error("fetchRecentMessagesAction error:", error);
        return { success: false, message: "Failed to fetch messages" };
    }
};

export const getLegacyLooseMessageCountAction = async (
    conversationId: string,
): Promise<{ success: boolean; count?: number; message?: string }> => {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "You need to be logged in to fetch messages" };
    }

    const access = await resolveMongoConversationAccess(conversationId, userDid, "read");
    if (!access.ok) {
        return { success: false, message: access.message };
    }

    try {
        const count = await countLegacyLooseMessages(conversationId);
        return { success: true, count };
    } catch (error) {
        console.error("getLegacyLooseMessageCountAction error:", error);
        return { success: false, message: "Failed to fetch earlier message count" };
    }
};

export const fetchLegacyLooseMessagesAction = async (
    conversationId: string,
): Promise<{ success: boolean; messages?: ChatMessage[]; message?: string }> => {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "You need to be logged in to fetch messages" };
    }

    const access = await resolveMongoConversationAccess(conversationId, userDid);
    if (!access.ok) {
        return { success: false, message: access.message };
    }

    try {
        const docs = await fetchLegacyLooseMessages(conversationId);
        if (!docs.length) {
            return { success: true, messages: [] };
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
        const replyObjectIds = replyIds.filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id));
        const replyDocs = replyObjectIds.length
            ? ((await ChatMessageDocs.find(
                  buildConversationScopedReplyFilter(conversationId, replyObjectIds) as any,
              ).toArray()) as any[])
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
            const presentedAuthor = getCircleModerationStarterAuthor({
                conversationSource: conversationMetadata?.source,
                messageSource: doc.source,
                messageVersion: doc.version,
                senderDid: doc.senderDid,
                realAuthor: senderByDid.get(doc.senderDid),
            });
            const author =
                presentedAuthor ||
                (shouldUseSystemTemplateAuthor ? fallbackSystemAuthor : undefined) ||
                (isTemplateSystemMessage
                    ? fallbackSystemAuthor
                    : ({
                          _id: doc.senderDid,
                          name: doc.senderDid,
                          picture: { url: "/placeholder.svg" },
                      } as Circle));

            const replyDoc = doc.replyToMessageId ? replyById.get(doc.replyToMessageId) : undefined;
            const replyAuthor = replyDoc
                ? getCircleModerationStarterAuthor({
                      conversationSource: conversationMetadata?.source,
                      messageSource: replyDoc.source,
                      messageVersion: replyDoc.version,
                      senderDid: replyDoc.senderDid,
                      realAuthor: senderByDid.get(replyDoc.senderDid),
                  }) ||
                  (isSystemMessageSource(replyDoc.source)
                      ? fallbackSystemAuthor
                      : ({
                            _id: replyDoc.senderDid,
                            name: replyDoc.senderDid,
                            picture: { url: "/placeholder.svg" },
                        } as Circle))
                : undefined;
            const normalizedReplyAttachments = Array.isArray(replyDoc?.attachments)
                ? replyDoc.attachments.map((attachment: ChatAttachment) => ({
                      ...attachment,
                      url: normalizeMediaUrl(attachment?.url) || attachment?.url,
                  }))
                : replyDoc?.attachments;

            const reactions = (doc.reactions || []).reduce((acc: Record<string, any[]>, reaction) => {
                if (!acc[reaction.emoji]) acc[reaction.emoji] = [];
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
                content: { msgtype: "m.text", body: doc.body },
                createdBy: doc.senderDid,
                createdAt: doc.createdAt,
                author,
                reactions,
                replyTo: replyDoc
                    ? {
                          id: replyDoc._id,
                          author: replyAuthor,
                          content: { msgtype: "m.text", body: replyDoc.body },
                          attachments: normalizedReplyAttachments,
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

        return { success: true, messages };
    } catch (error) {
        console.error("fetchLegacyLooseMessagesAction error:", error);
        return { success: false, message: "Failed to fetch earlier messages" };
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
            ? ((await ChatMessageDocs.find({ _id: { $in: replyObjectIds }, conversationId }).toArray()) as any[])
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
            const presentedAuthor = getCircleModerationStarterAuthor({
                conversationSource: conversationMetadata?.source,
                messageSource: doc.source,
                messageVersion: doc.version,
                senderDid: doc.senderDid,
                realAuthor: senderByDid.get(doc.senderDid),
            });
            const author =
                presentedAuthor ||
                (shouldUseSystemTemplateAuthor ? fallbackSystemAuthor : undefined) ||
                (isTemplateSystemMessage
                    ? fallbackSystemAuthor
                    : ({
                          _id: doc.senderDid,
                          name: doc.senderDid,
                          picture: { url: "/placeholder.svg" },
                      } as Circle));

            const replyDoc = doc.replyToMessageId ? replyById.get(doc.replyToMessageId) : undefined;
            const replyAuthor = replyDoc
                ? getCircleModerationStarterAuthor({
                      conversationSource: conversationMetadata?.source,
                      messageSource: replyDoc.source,
                      messageVersion: replyDoc.version,
                      senderDid: replyDoc.senderDid,
                      realAuthor: senderByDid.get(replyDoc.senderDid),
                  }) ||
                  (isSystemMessageSource(replyDoc.source)
                      ? fallbackSystemAuthor
                      : ({
                            _id: replyDoc.senderDid,
                            name: replyDoc.senderDid,
                            picture: { url: "/placeholder.svg" },
                        } as Circle))
                : undefined;
            const normalizedReplyAttachments = Array.isArray(replyDoc?.attachments)
                ? replyDoc.attachments.map((attachment: ChatAttachment) => ({
                      ...attachment,
                      url: normalizeMediaUrl(attachment?.url) || attachment?.url,
                  }))
                : replyDoc?.attachments;

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
                          attachments: normalizedReplyAttachments,
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
            (message as any).thread = (doc as any).thread;
            (message as any).threadId = (doc as any).threadId;

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
    const verificationMessage = await ensureInteractiveMessagingUser(userDid, "send messages");
    if (verificationMessage) {
        return { success: false, message: verificationMessage };
    }

    const access = await resolveMongoConversationAccess(conversationId, userDid, "write");
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
        const messageInput = {
            conversationId,
            senderDid: userDid,
            body: content,
            createdAt: new Date(),
            replyToMessageId,
            format,
        };
        observeChatActionEffect("message-persistence");
        const doc = getChatActionContext()?.createMessage
            ? await getChatActionContext()!.createMessage!(messageInput)
            : await createMessage(messageInput);
        const notificationInput = {
            conversationId,
            conversation: access.conversation,
            senderDid: userDid,
            messageBody: content,
            messageId: doc._id as string,
        };
        observeChatActionEffect("notification");
        if (getChatActionContext()?.notifyMessage) {
            await getChatActionContext()!.notifyMessage!(notificationInput);
        } else {
            await sendConversationMessageNotifications(notificationInput);
        }
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
    const verificationMessage = await ensureParticipatingMessagingUser(userDid, "send attachments");
    if (verificationMessage) {
        return { success: false, message: verificationMessage };
    }

    const conversationId = formData.get("roomId") as string;
    const file = formData.get("file") as File;
    const replyToMessageId =
        (formData.get("replyToMessageId") as string | undefined) ||
        (formData.get("replyToEventId") as string | undefined);
    const threadId = (formData.get("threadId") as string | undefined) || undefined;

    if (!conversationId || !file) {
        return { success: false, message: "Missing room ID or file" };
    }

    const MAX_SIZE = 5 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
        return { success: false, message: "File size exceeds 5MB limit" };
    }

    const access = await resolveMongoConversationAccess(conversationId, userDid, "write");
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

        observeChatActionEffect("storage-write");
        const fileInfo = getChatActionContext()?.saveFile
            ? await getChatActionContext()!.saveFile!(file, "chat-attachment", ownerCircle._id as string, true)
            : await saveFile(file, "chat-attachment", ownerCircle._id as string, true);
        const attachment = {
            url: fileInfo.url,
            key: fileInfo.fileName,
            name: fileInfo.originalName || file.name,
            mimeType: file.type,
            size: file.size,
        };

        observeChatActionEffect("message-persistence");
        let doc;
        try {
            doc = threadId
                ? await createThreadReply(threadId, conversationId, userDid, {
                      body: file.name,
                      attachments: [attachment],
                      replyToMessageId,
                  })
                : getChatActionContext()?.createMessage
                  ? await getChatActionContext()!.createMessage!({
                        conversationId,
                        senderDid: userDid,
                        body: file.name,
                        createdAt: new Date(),
                        replyToMessageId,
                        attachments: [attachment],
                    })
                  : await createMessage({
                        conversationId,
                        senderDid: userDid,
                        body: file.name,
                        createdAt: new Date(),
                        replyToMessageId,
                        attachments: [attachment],
                    });
        } catch (error) {
            if (!(error instanceof PersistedChatMessageActivityError)) {
                const cleanup = await cleanupUploadedFiles([attachment], getChatActionContext()?.deleteFile || deleteFile);
                if (cleanup.failedDeletes.length)
                    console.error("Failed to clean up rejected chat attachment", cleanup.failedDeletes);
            }
            throw error;
        }
        if (!doc?._id) {
            return {
                success: false,
                message: threadId ? "Topic not found for this conversation" : "Failed to send attachment",
            };
        }
        observeChatActionEffect("notification");
        await sendConversationMessageNotifications({
            conversationId,
            conversation: access.conversation,
            senderDid: userDid,
            messageBody: file.name,
            messageId: doc._id as string,
            topicId: threadId,
        });

        return { success: true, messageId: doc._id as string };
    } catch (error) {
        console.error("❌ Error sending mongo attachment:", error);
        return { success: false, message: error instanceof Error ? error.message : "Failed to send attachment" };
    }
};

const COMPOSED_MESSAGE_MAX_ATTACHMENTS = 10;
const COMPOSED_MESSAGE_MAX_FILE_SIZE = 5 * 1024 * 1024;
const COMPOSED_MESSAGE_MAX_TOTAL_SIZE = 25 * 1024 * 1024;

const getComposedMessageFiles = (formData: FormData): FormDataEntryValue[] => {
    const files = formData.getAll("files");
    if (files.length) return files;
    const compatibleFiles = formData.getAll("file");
    return compatibleFiles;
};

export const sendComposedMessageAction = async (
    formData: FormData,
): Promise<{ success: boolean; messageId?: string; message?: string; createdAt?: Date; submissionId?: string }> => {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) return { success: false, message: "You need to be logged in to send messages" };

    const verificationMessage = await ensureInteractiveMessagingUser(userDid, "send messages");
    if (verificationMessage) return { success: false, message: verificationMessage };

    const conversationId = String(formData.get("roomId") || "");
    const requestedBody = String(formData.get("body") || formData.get("content") || "").trim();
    const replyToMessageId =
        String(formData.get("replyToMessageId") || formData.get("replyToEventId") || "") || undefined;
    const threadId = String(formData.get("threadId") || "") || undefined;
    const submissionId = String(formData.get("submissionId") || "") || undefined;
    const fileEntries = getComposedMessageFiles(formData);

    if (!conversationId) return { success: false, message: "Missing room ID" };
    if (!requestedBody && fileEntries.length === 0) return { success: false, message: "Message cannot be empty" };
    if (fileEntries.length > COMPOSED_MESSAGE_MAX_ATTACHMENTS) {
        return { success: false, message: "A message can include at most 10 attachments" };
    }
    if (submissionId && (submissionId.length < 8 || submissionId.length > 128)) {
        return { success: false, message: "Invalid message submission" };
    }
    if (fileEntries.some((entry) => !isUploadedFileLike(entry))) {
        return { success: false, message: "Invalid attachment" };
    }
    const files = fileEntries as File[];
    if (files.some((file) => file.size > COMPOSED_MESSAGE_MAX_FILE_SIZE)) {
        return { success: false, message: "File size exceeds 5MB limit" };
    }
    if (files.reduce((total, file) => total + file.size, 0) > COMPOSED_MESSAGE_MAX_TOTAL_SIZE) {
        return { success: false, message: "Combined attachment size exceeds 25MB limit" };
    }

    const access = await resolveMongoConversationAccess(conversationId, userDid, "write");
    if (!access.ok) return { success: false, message: access.message };
    if (access.conversation?.type === "announcement") {
        return { success: false, message: "Replies are disabled for this conversation." };
    }
    const replyValidation = await validateReplyTargetForConversation(conversationId, replyToMessageId);
    if (!replyValidation.ok) return { success: false, message: replyValidation.message };
    if (threadId) {
        const topic = getChatActionContext()?.findThreadStarter
            ? await getChatActionContext()!.findThreadStarter!(threadId, conversationId)
            : await findThreadStarter(threadId, conversationId);
        if (!topic || topic.conversationId !== conversationId) {
            return { success: false, message: "Topic not found for this conversation" };
        }
    }

    const body = requestedBody || files[0]?.name || "";
    const findExistingSubmission = async () => {
        if (!submissionId) return null;
        const existing = getChatActionContext()?.findMessageBySubmissionId
            ? await getChatActionContext()!.findMessageBySubmissionId!(userDid, submissionId)
            : await ChatMessageDocs.findOne({ senderDid: userDid, submissionId });
        if (!existing) return null;
        const matches =
            existing.conversationId === conversationId &&
            existing.senderDid === userDid &&
            existing.body === body &&
            (existing.replyToMessageId || undefined) === replyToMessageId &&
            (existing.threadId || undefined) === threadId;
        if (!matches) return { conflict: true as const };
        return { conflict: false as const, message: existing };
    };

    const existingSubmission = await findExistingSubmission();
    if (existingSubmission?.conflict) {
        return { success: false, message: "Message submission id was already used for another message" };
    }
    if (existingSubmission?.message) {
        try {
            if (getChatActionContext()?.refreshMessageActivity) {
                await getChatActionContext()!.refreshMessageActivity!(existingSubmission.message);
            } else {
                await refreshPersistedMessageActivity(existingSubmission.message);
            }
        } catch (error) {
            console.error("sendComposedMessageAction activity recovery error:", error);
            return {
                success: false,
                message: "Message was saved, but chat activity could not be updated. Retry to confirm.",
            };
        }
        return {
            success: true,
            messageId: existingSubmission.message._id.toString(),
            createdAt: existingSubmission.message.createdAt,
            submissionId,
        };
    }

    const uploadedAttachments: ChatAttachment[] = [];
    let persistenceAttempted = false;
    const cleanupUploads = async (attachments = uploadedAttachments) => {
        const cleanup = await cleanupUploadedFiles(
            attachments,
            getChatActionContext()?.deleteFile || deleteFile,
        );
        if (cleanup.failedDeletes.length) {
            console.error("Failed to clean up composed message attachments", cleanup.failedDeletes);
        }
    };

    try {
        const ownerCircle = files.length
            ? access.conversation?.circleId
                ? getChatActionContext()?.findCircle
                    ? await getChatActionContext()!.findCircle!(access.conversation.circleId)
                    : await getCircleById(access.conversation.circleId)
                : await getCircleByDid(userDid)
            : undefined;
        if (files.length && !ownerCircle?._id) return { success: false, message: "Could not resolve storage owner" };

        for (const file of files) {
            observeChatActionEffect("storage-write");
            const fileInfo = getChatActionContext()?.saveFile
                ? await getChatActionContext()!.saveFile!(file, "chat-attachment", ownerCircle!._id as string, true)
                : await saveFile(file, "chat-attachment", ownerCircle!._id as string, true);
            uploadedAttachments.push({
                url: fileInfo.url,
                key: fileInfo.fileName,
                name: fileInfo.originalName || file.name,
                mimeType: file.type,
                size: file.size,
            });
        }

        persistenceAttempted = true;
        observeChatActionEffect(threadId ? "reply-create" : "message-persistence");
        let doc: ChatMessageDoc | null;
        let created = true;
        if (threadId) {
            const replyInput = {
                body,
                attachments: uploadedAttachments.length ? uploadedAttachments : undefined,
                replyToMessageId,
                submissionId,
            };
            doc = getChatActionContext()?.createThreadReply
                ? await getChatActionContext()!.createThreadReply!(threadId, conversationId, userDid, replyInput)
                : await createThreadReply(threadId, conversationId, userDid, replyInput);
            created =
                !submissionId ||
                uploadedAttachments.length === 0 ||
                (doc?.attachments?.length === uploadedAttachments.length &&
                    uploadedAttachments.every((uploaded, index) => doc?.attachments?.[index]?.url === uploaded.url));
        } else if (submissionId && !getChatActionContext()?.createMessage) {
            const result = await createIdempotentMessage({
                conversationId,
                senderDid: userDid,
                body,
                createdAt: new Date(),
                replyToMessageId,
                attachments: uploadedAttachments.length ? uploadedAttachments : undefined,
                submissionId,
            });
            doc = result.message;
            created = result.created;
        } else {
            doc = getChatActionContext()?.createMessage
                ? await getChatActionContext()!.createMessage!({
                      conversationId,
                      senderDid: userDid,
                      body,
                      createdAt: new Date(),
                      replyToMessageId,
                      attachments: uploadedAttachments.length ? uploadedAttachments : undefined,
                      submissionId,
                  })
                : await createMessage({
                      conversationId,
                      senderDid: userDid,
                      body,
                      createdAt: new Date(),
                      replyToMessageId,
                      attachments: uploadedAttachments.length ? uploadedAttachments : undefined,
                      submissionId,
                  });
        }

        if (!doc?._id) throw new Error(threadId ? "Topic not found for this conversation" : "Failed to send message");
        if (!created) await cleanupUploads();

        try {
            observeChatActionEffect("notification");
            const notificationInput = {
                conversationId,
                conversation: access.conversation,
                senderDid: userDid,
                messageBody: body,
                messageId: doc._id.toString(),
                topicId: threadId,
                idempotencyKey: submissionId ? `composed-message:${submissionId}` : undefined,
            };
            if (getChatActionContext()?.notifyMessage) {
                await getChatActionContext()!.notifyMessage!(notificationInput);
            } else {
                await sendConversationMessageNotifications(notificationInput);
            }
        } catch (notificationError) {
            console.error("sendComposedMessageAction notification error:", notificationError);
        }

        return {
            success: true,
            messageId: doc._id.toString(),
            createdAt: doc.createdAt,
            submissionId: doc.submissionId,
        };
    } catch (error) {
        if (error instanceof PersistedChatMessageActivityError) {
            console.error("sendComposedMessageAction persisted message activity error:", error);
            return {
                success: false,
                message: "Message was saved, but chat activity could not be updated. Retry to confirm.",
            };
        }
        if (persistenceAttempted && uploadedAttachments.length) {
            let persistedMessage: ChatMessageDoc | null;
            let referencedUploadUrls = new Set<string>();
            try {
                if (submissionId) {
                    const candidate = getChatActionContext()?.findMessageBySubmissionId
                        ? await getChatActionContext()!.findMessageBySubmissionId!(userDid, submissionId)
                        : await ChatMessageDocs.findOne({ senderDid: userDid, submissionId });
                    if (candidate?.attachments) {
                        referencedUploadUrls = new Set(candidate.attachments.map((attachment: ChatAttachment) => attachment.url));
                    }
                    const candidateMatchesSubmission =
                        candidate?.conversationId === conversationId &&
                        candidate?.senderDid === userDid &&
                        candidate?.body === body &&
                        (candidate?.replyToMessageId || undefined) === replyToMessageId &&
                        (candidate?.threadId || undefined) === threadId;
                    persistedMessage =
                        candidateMatchesSubmission &&
                        candidate?.attachments?.length === uploadedAttachments.length &&
                        uploadedAttachments.every(
                            (attachment, index) => candidate.attachments?.[index]?.url === attachment.url,
                        )
                            ? (candidate as ChatMessageDoc)
                            : null;
                } else {
                    persistedMessage = (await ChatMessageDocs.findOne({
                        conversationId,
                        senderDid: userDid,
                        body,
                        ...(threadId ? { threadId } : { threadId: { $exists: false } }),
                        ...(replyToMessageId ? { replyToMessageId } : { replyToMessageId: { $exists: false } }),
                        "attachments.url": { $all: uploadedAttachments.map((attachment) => attachment.url) },
                    })) as ChatMessageDoc | null;
                    if (persistedMessage?.attachments) {
                        referencedUploadUrls = new Set(
                            persistedMessage.attachments.map((attachment) => attachment.url),
                        );
                    }
                }
            } catch (recoveryError) {
                console.error("sendComposedMessageAction persistence recovery lookup error:", recoveryError);
                return {
                    success: false,
                    message: "Could not confirm whether the message was saved. Retry with the same submission.",
                };
            }
            if (persistedMessage?._id) {
                try {
                    if (getChatActionContext()?.refreshMessageActivity) {
                        await getChatActionContext()!.refreshMessageActivity!(persistedMessage);
                    } else {
                        await refreshPersistedMessageActivity(persistedMessage);
                    }
                } catch (recoveryError) {
                    console.error("sendComposedMessageAction activity recovery error:", recoveryError);
                    return {
                        success: false,
                        message: "Message was saved, but chat activity could not be updated. Retry to confirm.",
                    };
                }
                return {
                    success: true,
                    messageId: persistedMessage._id.toString(),
                    createdAt: persistedMessage.createdAt,
                    submissionId: persistedMessage.submissionId,
                };
            }
            if (referencedUploadUrls.size) {
                await cleanupUploads(
                    uploadedAttachments.filter((attachment) => !referencedUploadUrls.has(attachment.url)),
                );
                return { success: false, message: "Submission id was already used for another message" };
            }
        }
        await cleanupUploads();
        console.error("sendComposedMessageAction error:", error);
        return { success: false, message: error instanceof Error ? error.message : "Failed to send message" };
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
    if (!ObjectId.isValid(messageId)) return { success: false, message: CHAT_UNAVAILABLE_MESSAGE };

    const messageDoc = getChatActionContext()?.findMessage
        ? await getChatActionContext()!.findMessage!(messageId)
        : await ChatMessageDocs.findOne({ _id: new ObjectId(messageId) }, { projection: { conversationId: 1 } });
    if (!messageDoc?.conversationId) return { success: false, message: CHAT_UNAVAILABLE_MESSAGE };
    const access = await resolveMongoConversationAccess(messageDoc.conversationId, userDid, "write");
    if (!access.ok) return { success: false, message: access.message };
    observeChatActionEffect("message-edit");
    const updated = await updateMessage(messageId, userDid, content);
    return updated ? { success: true } : { success: false, message: "Failed to edit message" };
};

export const deleteMongoMessageAction = async (messageId: string): Promise<{ success: boolean; message?: string }> => {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "You need to be logged in to delete messages" };
    }
    if (!ObjectId.isValid(messageId)) return { success: false, message: CHAT_UNAVAILABLE_MESSAGE };

    const messageDoc = getChatActionContext()?.findMessage
        ? await getChatActionContext()!.findMessage!(messageId)
        : await ChatMessageDocs.findOne({ _id: new ObjectId(messageId) }, { projection: { conversationId: 1 } });
    if (!messageDoc?.conversationId) return { success: false, message: CHAT_UNAVAILABLE_MESSAGE };
    const access = await resolveMongoConversationAccess(messageDoc.conversationId, userDid, "write");
    if (!access.ok) return { success: false, message: access.message };
    observeChatActionEffect("message-delete");
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
        messageDoc = (
            getChatActionContext()?.findMessage
                ? await getChatActionContext()!.findMessage!(messageId)
                : await ChatMessageDocs.findOne({ _id: new ObjectId(messageId) }, { projection: { conversationId: 1 } })
        ) as { conversationId?: string } | null;
    } catch {
        return { success: false, message: CHAT_UNAVAILABLE_MESSAGE };
    }

    if (!messageDoc?.conversationId) {
        return { success: false, message: CHAT_UNAVAILABLE_MESSAGE };
    }

    const access = await resolveMongoConversationAccess(messageDoc.conversationId, userDid, "write");
    if (!access.ok) {
        return { success: false, message: access.message };
    }

    observeChatActionEffect("reaction-mutation");
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
    const verificationMessage = await ensureInteractiveMessagingUser(userDid, "start direct messages");
    if (verificationMessage) {
        return { success: false, message: verificationMessage };
    }

    const recipient = inRecipient?.did ? await getCircleByDid(inRecipient.did) : undefined;
    if (!recipient) {
        return { success: false, message: "Could not find recipient" };
    }

    const currentUser = await getCircleByDid(userDid);
    if (!currentUser || currentUser._id === recipient._id) {
        return { success: false, message: "You cannot send a message to yourself" };
    }

    const dmEligibility = await getDmEligibility(userDid, recipient.did!);
    if (!dmEligibility.isAllowed) {
        return {
            success: false,
            message: "Messaging is only available for existing conversations and contacts right now.",
        };
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
    const verificationMessage = await ensureParticipatingMessagingUser(userDid, "create group chats");
    if (verificationMessage) {
        return { success: false, message: verificationMessage };
    }

    const name = formData.get("name") as string;
    const participantDidsJson = formData.get("participants") as string;
    const avatarFile = formData.get("avatar");

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
        let picture: { url: string } | undefined;

        if (isUploadedFileLike(avatarFile) && avatarFile.size > 0) {
            const MAX_SIZE = 5 * 1024 * 1024;
            if (avatarFile.size > MAX_SIZE) {
                return { success: false, message: "File size exceeds 5MB limit" };
            }

            const { saveFile } = await import("@/lib/data/storage");
            const { getCircleByDid } = await import("@/lib/data/circle");
            const ownerCircle = await getCircleByDid(userDid);

            if (!ownerCircle?._id) {
                return { success: false, message: "Could not resolve storage owner" };
            }

            const fileInfo = getChatActionContext()?.saveFile
                ? await getChatActionContext()!.saveFile!(
                      avatarFile,
                      "chat-group-avatar",
                      ownerCircle._id as string,
                      true,
                  )
                : await saveFile(avatarFile, "chat-group-avatar", ownerCircle._id as string, true);
            picture = { url: fileInfo.url };
        }

        const conversation = await createConversation({
            type: "group",
            name,
            handle: handle || `group-${Date.now()}`,
            participants,
            createdAt: new Date(),
            updatedAt: new Date(),
            picture,
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
    contactType: CircleContactType = "offer_help",
): Promise<{ success: boolean; roomId?: string; message?: string; created?: boolean }> => {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "You need to be logged in to contact this circle" };
    }
    const verificationMessage = await ensureParticipatingMessagingUser(userDid, "contact circle admins");
    if (verificationMessage) {
        return { success: false, message: verificationMessage };
    }

    const trimmedMessage = message?.trim();
    if (!circleId) {
        return { success: false, message: "Missing circle id" };
    }
    if (!trimmedMessage) {
        return { success: false, message: "Message is required" };
    }

    const circle = await authorizeCircleChatEntry(userDid, circleId, "write", {
        loadCircle: async (id) =>
            getChatActionContext()?.findCircle ? getChatActionContext()!.findCircle!(id) : getCircleById(id),
        canRead: async (did, value) =>
            canReadCircle(did, value, {
                getMember: async (viewerDid, ownerId) =>
                    getChatActionContext()?.findCanonicalMember
                        ? getChatActionContext()!.findCanonicalMember!(viewerDid, ownerId)
                        : Members.findOne({ userDid: viewerDid, circleId: ownerId }),
            }),
        assertWritable: assertCircleWritesAllowed,
    });
    if (!circle?._id) {
        return { success: false, message: "Circle unavailable" };
    }
    if (circle.circleType === "user") {
        return { success: false, message: "This contact flow is available for circles and projects only" };
    }
    try {
        await assertCircleWritesAllowed(circle);
    } catch {
        return { success: false, message: "This circle is not accepting messages right now" };
    }
    if (getChatActionContext()?.contactCircleAdminsEffect) {
        return await getChatActionContext()!.contactCircleAdminsEffect!({
            circleId,
            message: trimmedMessage,
            offeredSkillHandles,
            contactType,
            userDid,
            circle,
        });
    }

    const adminRows = await Members.find({ circleId, userGroups: "admins" }, { projection: { userDid: 1 } }).toArray();
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
    const threadName =
        contactType === "ask_question"
            ? `Question about helping: ${circle.name || "Circle"}`
            : `Offer Help: ${circle.name || "Circle"}`;
    const threadHandle = buildCircleContactHandle(circleId, userDid);
    const requester = await getCircleByDid(userDid);
    const requesterName = requester?.name?.trim() || "A member";
    const offeredSkillNames = Array.from(
        new Set(
            (offeredSkillHandles || [])
                .filter((handle): handle is string => typeof handle === "string" && !!handle.trim())
                .map((handle) => getSkillLabelByHandle(handle) || handle),
        ),
    );
    const offeredSkillsContext =
        contactType === "ask_question"
            ? offeredSkillNames.length > 0
                ? `${requesterName} asked a question about helping with:\n${offeredSkillNames
                      .map((skill) => `• ${skill}`)
                      .join("\n")}`
                : `${requesterName} asked a question about helping with this circle.`
            : offeredSkillNames.length > 0
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
                observeChatActionEffect("conversation-mutation");
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
                                contactType,
                            },
                            updatedAt: new Date(),
                        },
                    },
                );
            }
        } else {
            observeChatActionEffect("conversation-ensure-create");
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
                    contactType,
                },
            });

            conversationId = String(conversation._id);
            created = true;
        }

        const now = new Date();
        for (const participantDid of participants) {
            const role = adminDidSet.has(participantDid) ? "admin" : "member";
            observeChatActionEffect("member-add");
            observeChatActionEffect("membership-mutation");
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
            observeChatActionEffect("message-persistence");
            observeChatActionEffect("conversation-mutation");
            await createMessage({
                conversationId,
                senderDid: userDid,
                body: offeredSkillsContext,
                createdAt: new Date(),
            });
        }

        observeChatActionEffect("message-persistence");
        observeChatActionEffect("conversation-mutation");
        await createMessage({
            conversationId,
            senderDid: userDid,
            body: trimmedMessage,
            createdAt: new Date(),
        });
        observeChatActionEffect("notification");
        await sendConversationMessageNotifications({
            conversationId,
            conversation: existingConversation || {
                type: "group",
                circleId,
                name: threadName,
                metadata: {
                    source: CIRCLE_CONTACT_SOURCE,
                    version: CIRCLE_CONTACT_VERSION,
                    contactType,
                },
                participants,
            },
            senderDid: userDid,
            messageBody: trimmedMessage,
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
        const allowed = await resolveMongoConversationAccessBatch(conversationIds, userDid, "read");
        const allowedConversationIds = conversationIds.filter((conversationId) => allowed.has(conversationId));
        const counts = await getUnreadCountsForUser(userDid, allowedConversationIds);
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

    const access = await resolveMongoConversationAccess(conversationId, userDid, "read");
    if (!access.ok) return { success: false, message: access.message };

    let effectiveLastSeen = lastSeenMessageId;

    // The conversation cursor is now reserved for loose legacy messages.
    // Topic starters and replies are advanced only by markTopicReadAction.
    if (effectiveLastSeen === null) {
        effectiveLastSeen = await getLatestLegacyMessageIdForConversation(conversationId);
    }

    observeChatActionEffect("conversation-read-state");
    await markConversationRead(userDid, conversationId, effectiveLastSeen);
    return { success: true };
};

export const getTopicUnreadCountsAction = async (
    conversationId: string,
    topicIds?: string[],
): Promise<{
    success: boolean;
    counts?: Record<string, number>;
    conversationUnreadCount?: number;
    message?: string;
}> => {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) return { success: false, message: "Not authenticated" };
    const access = await resolveMongoConversationAccess(conversationId, userDid);
    if (!access.ok) return { success: false, message: access.message };
    try {
        const [counts, legacyUnreadCount] = await Promise.all([
            getTopicUnreadCountsForUser(userDid, conversationId, topicIds),
            getLegacyUnreadCountForUser(userDid, conversationId),
        ]);
        return {
            success: true,
            counts,
            conversationUnreadCount: sumConversationUnreadCounts(legacyUnreadCount, counts),
        };
    } catch (error) {
        console.error("getTopicUnreadCountsAction error:", error);
        return { success: false, message: "Failed to fetch topic unread counts" };
    }
};

export const markTopicReadAction = async (
    conversationId: string,
    topicId: string,
    lastSeenMessageId: string,
): Promise<{
    success: boolean;
    lastReadMessageId?: string | null;
    readStatePersisted?: boolean;
    message?: string;
}> => {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) return { success: false, message: "Not authenticated" };
    const access = await resolveMongoConversationAccess(conversationId, userDid, "read");
    if (!access.ok) return { success: false, message: access.message };
    const normalizedTopicId = normalizeObjectIdHex(topicId);
    if (!normalizedTopicId) return { success: false, message: "Invalid topic" };
    const topic = await findThreadStarter(normalizedTopicId, conversationId);
    if (!topic) return { success: false, message: "Topic not found for this conversation" };

    const validatedCursor = await validateTopicReadCursor(conversationId, normalizedTopicId, lastSeenMessageId);
    if (!validatedCursor) return { success: false, message: "Invalid topic read boundary" };
    observeChatActionEffect("topic-read-state");
    await markTopicRead(userDid, conversationId, normalizedTopicId, validatedCursor);
    try {
        await acknowledgeTopicPmNotifications({
            userDid,
            conversationId,
            topicId: normalizedTopicId,
            lastReadMessageId: validatedCursor,
        });
    } catch (error) {
        console.error("Failed to acknowledge topic PM notifications:", error);
        return {
            success: false,
            lastReadMessageId: validatedCursor,
            readStatePersisted: true,
            message: "Topic read state was saved, but notification acknowledgement must be retried.",
        };
    }
    return { success: true, lastReadMessageId: validatedCursor };
};

export const createThreadAction = async (
    conversationId: string,
    title: string,
    body: string,
    hashtags: string[],
): Promise<{ success: boolean; message?: string; threadId?: string }> => {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) return { success: false, message: "Not authenticated" };
    if (!title.trim()) return { success: false, message: "Thread title is required" };
    const access = await resolveMongoConversationAccess(conversationId, userDid, "write");
    if (!access.ok) return { success: false, message: access.message };
    if (access.conversation?.type === "announcement") {
        return { success: false, message: "Replies are disabled for this conversation." };
    }
    try {
        const { createThread } = await import("@/lib/data/mongo-chat");
        observeChatActionEffect("topic-create");
        const doc = await createThread(conversationId, userDid, title.trim(), body.trim(), hashtags);
        if (!doc?._id) return { success: false, message: "Failed to create thread" };
        return { success: true, threadId: doc._id.toString() };
    } catch (error) {
        console.error("createThreadAction error:", error);
        return { success: false, message: "Failed to create thread" };
    }
};

const getTopicMutationError = (reason?: string): string => {
    if (reason === "forbidden") return "Only the topic creator can change this topic.";
    if (reason === "invalid_id" || reason === "not_found") return "Topic not found for this conversation.";
    return "The topic could not be changed. Please try again.";
};

export const updateTopicAction = async (
    conversationId: string,
    topicId: string,
    title: string,
    body: string,
): Promise<{ success: boolean; message?: string }> => {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) return { success: false, message: "Not authenticated" };
    if (!title.trim()) return { success: false, message: "Topic title is required" };

    const access = await resolveMongoConversationAccess(conversationId, userDid, "write");
    if (!access.ok) return { success: false, message: access.message };

    try {
        observeChatActionEffect("topic-update");
        const result = await updateTopic(topicId, conversationId, userDid, title.trim(), body.trim());
        return result.success ? { success: true } : { success: false, message: getTopicMutationError(result.reason) };
    } catch (error) {
        console.error("updateTopicAction error:", error);
        return { success: false, message: "Failed to update topic" };
    }
};

export const deleteTopicAction = async (
    conversationId: string,
    topicId: string,
): Promise<{ success: boolean; message?: string; deletedReplyCount?: number }> => {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) return { success: false, message: "Not authenticated" };

    const access = await resolveMongoConversationAccess(conversationId, userDid, "write");
    if (!access.ok) return { success: false, message: access.message };

    try {
        observeChatActionEffect("topic-delete");
        const result = await deleteTopic(topicId, conversationId, userDid);
        return result.success
            ? { success: true, deletedReplyCount: result.deletedReplyCount }
            : { success: false, message: getTopicMutationError(result.reason) };
    } catch (error) {
        console.error("deleteTopicAction error:", error);
        return { success: false, message: "Failed to delete topic" };
    }
};

export const sendThreadReplyAction = async (
    threadId: string,
    conversationId: string,
    body: string,
    replyToMessageId?: string,
    submissionId?: string,
): Promise<{ success: boolean; message?: string; messageId?: string; createdAt?: Date; submissionId?: string }> => {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) return { success: false, message: "Not authenticated" };
    if (!body.trim()) return { success: false, message: "Reply cannot be empty" };
    if (submissionId && (submissionId.length < 8 || submissionId.length > 128)) {
        return { success: false, message: "Invalid reply submission" };
    }
    const access = await resolveMongoConversationAccess(conversationId, userDid, "write");
    if (!access.ok) return { success: false, message: access.message };
    if (access.conversation?.type === "announcement") {
        return { success: false, message: "Replies are disabled for this conversation." };
    }
    const replyValidation = await validateReplyTargetForConversation(conversationId, replyToMessageId);
    if (!replyValidation.ok) {
        return { success: false, message: replyValidation.message };
    }
    try {
        const { sendThreadReply } = await import("@/lib/data/mongo-chat");
        observeChatActionEffect("reply-create");
        const doc = await sendThreadReply(
            threadId,
            conversationId,
            userDid,
            body.trim(),
            replyToMessageId,
            submissionId,
        );
        if (!doc?._id) return { success: false, message: "Topic not found for this conversation" };
        // Fire notifications (DM and circle-contact conversations only for now)
        try {
            observeChatActionEffect("notification");
            await sendConversationMessageNotifications({
                conversationId,
                conversation: access.conversation,
                senderDid: userDid,
                messageBody: body.trim(),
                messageId: doc._id.toString(),
                topicId: threadId,
                idempotencyKey: submissionId ? `topic-reply:${submissionId}` : undefined,
            });
        } catch (notifError) {
            console.error("sendThreadReplyAction notification error:", notifError);
        }
        return {
            success: true,
            messageId: doc._id.toString(),
            createdAt: doc.createdAt,
            submissionId: doc.submissionId,
        };
    } catch (error) {
        console.error("sendThreadReplyAction error:", error);
        return { success: false, message: "Failed to send reply" };
    }
};

export const fetchThreadRepliesAction = async (
    threadId: string,
    conversationId: string,
): Promise<{ success: boolean; message?: string; replies?: any[] }> => {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) return { success: false, message: "Not authenticated" };
    const access = await resolveMongoConversationAccess(conversationId, userDid);
    if (!access.ok) return { success: false, message: access.message };
    try {
        const conversationMetadata = (access.conversation as any)?.metadata as Record<string, unknown> | undefined;
        const { fetchThreadReplies } = await import("@/lib/data/mongo-chat");
        const threadStarter = await findThreadStarter(threadId, conversationId);
        if (!threadStarter) return { success: false, message: "Topic not found for this conversation" };
        const docs = await fetchThreadReplies(threadId, conversationId);
        if (!docs.length) return { success: true, replies: [] };

        // Enrich with author info
        const senderDids = Array.from(new Set(docs.map((doc) => doc.senderDid)));
        const senders = senderDids.length ? await getCirclesByDids(senderDids) : [];
        const senderByDid = new Map(senders.map((circle) => [circle.did, circle]));
        const replyIds = Array.from(new Set(docs.map((doc) => doc.replyToMessageId).filter(Boolean) as string[]));
        const replyObjectIds = replyIds.map((id) => new ObjectId(id));
        const replyDocs = replyObjectIds.length
            ? ((await ChatMessageDocs.find({ _id: { $in: replyObjectIds }, conversationId }).toArray()) as any[])
            : [];
        const replyById = new Map(
            replyDocs.map((reply) => [reply._id.toString(), { ...reply, _id: reply._id.toString() }]),
        );

        const enriched = docs.map((doc) => {
            const circle = senderByDid.get(doc.senderDid);
            const fullName = circle?.name || "";
            const firstName = fullName.trim().split(" ")[0] || circle?.handle || doc.senderDid;
            const replyDoc = doc.replyToMessageId ? replyById.get(doc.replyToMessageId) : undefined;
            const replyAuthorCircle = replyDoc
                ? getCircleModerationStarterAuthor({
                      conversationSource: conversationMetadata?.source,
                      messageSource: replyDoc.source,
                      messageVersion: replyDoc.version,
                      senderDid: replyDoc.senderDid,
                      realAuthor: senderByDid.get(replyDoc.senderDid),
                  })
                : undefined;
            const normalizedReplyAttachments = Array.isArray(replyDoc?.attachments)
                ? replyDoc.attachments.map((attachment: ChatAttachment) => ({
                      ...attachment,
                      url: normalizeMediaUrl(attachment?.url) || attachment?.url,
                  }))
                : replyDoc?.attachments;
            return {
                ...doc,
                _id: doc._id?.toString(),
                authorName: firstName,
                authorPicture: circle?.picture?.url || null,
                replyTo: replyDoc
                    ? {
                          id: replyDoc._id,
                          author: replyAuthorCircle || {
                              _id: replyDoc.senderDid,
                              name: replyDoc.senderDid,
                              picture: { url: "/placeholder.svg" },
                          },
                          content: { msgtype: "m.text", body: replyDoc.body },
                          attachments: normalizedReplyAttachments,
                      }
                    : undefined,
                submissionId: doc.submissionId,
            };
        });

        return { success: true, replies: enriched };
    } catch (error) {
        console.error("fetchThreadRepliesAction error:", error);
        return { success: false, message: "Failed to fetch replies" };
    }
};

export const listThreadsAction = async (
    conversationId: string,
): Promise<{ success: boolean; message?: string; threads?: any[] }> => {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) return { success: false, message: "Not authenticated" };
    const access = await resolveMongoConversationAccess(conversationId, userDid);
    if (!access.ok) return { success: false, message: access.message };
    try {
        const { listThreadsForConversation } = await import("@/lib/data/mongo-chat");
        const threads = await listThreadsForConversation(conversationId);
        return { success: true, threads };
    } catch (error) {
        console.error("listThreadsAction error:", error);
        return { success: false, message: "Failed to list threads" };
    }
};

export const getTopicSortPreferenceAction = async (
    conversationId: string,
): Promise<{ success: boolean; sortOrder?: "latest_activity" | "date_created"; message?: string }> => {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) return { success: false, message: "Not authenticated" };
    const access = await resolveMongoConversationAccess(conversationId, userDid);
    if (!access.ok) return { success: false, message: access.message };
    return { success: true, sortOrder: await getTopicSortOrder(userDid, conversationId) };
};

export const setTopicSortPreferenceAction = async (
    conversationId: string,
    sortOrder: "latest_activity" | "date_created",
): Promise<{ success: boolean; message?: string }> => {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) return { success: false, message: "Not authenticated" };
    if (sortOrder !== "latest_activity" && sortOrder !== "date_created") {
        return { success: false, message: "Invalid topic sort preference" };
    }
    const access = await resolveMongoConversationAccess(conversationId, userDid);
    if (!access.ok) return { success: false, message: access.message };
    await setTopicSortOrder(userDid, conversationId, sortOrder);
    return { success: true };
};

export const fetchTopicStartersAction = async (
    conversationId: string,
): Promise<{ success: boolean; messages?: ChatMessage[]; message?: string }> => {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "You need to be logged in to fetch messages" };
    }

    const access = await resolveMongoConversationAccess(conversationId, userDid);
    if (!access.ok) {
        return { success: false, message: access.message };
    }

    try {
        const docs = await fetchTopicStarters(conversationId);
        if (!docs.length) {
            return { success: true, messages: [] };
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
            const presentedAuthor = getCircleModerationStarterAuthor({
                conversationSource: conversationMetadata?.source,
                messageSource: doc.source,
                messageVersion: doc.version,
                senderDid: doc.senderDid,
                realAuthor: senderByDid.get(doc.senderDid),
            });
            const author =
                presentedAuthor ||
                (shouldUseSystemTemplateAuthor ? fallbackSystemAuthor : undefined) ||
                (isTemplateSystemMessage
                    ? fallbackSystemAuthor
                    : ({
                          _id: doc.senderDid,
                          name: doc.senderDid,
                          picture: { url: "/placeholder.svg" },
                      } as Circle));

            const reactions = (doc.reactions || []).reduce((acc: Record<string, any[]>, reaction) => {
                if (!acc[reaction.emoji]) acc[reaction.emoji] = [];
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
                content: { msgtype: "m.text", body: doc.body },
                createdBy: doc.senderDid,
                createdAt: doc.createdAt,
                author,
                reactions,
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
            (message as any).thread = (doc as any).thread;
            (message as any).threadId = (doc as any).threadId;

            return message;
        });

        return { success: true, messages };
    } catch (error) {
        console.error("fetchTopicStartersAction error:", error);
        return { success: false, message: "Failed to fetch topic starters" };
    }
};
