"use server";

import { ObjectId } from "mongodb";
import type { ChatAttachment } from "@/lib/chat/mongo-types";
import { ChatMessage, ChatRoomDisplay, Circle } from "@/models/models";
import {
    createConversation,
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
    getLatestLegacyMessageIdForConversation,
    findOrCreateDmConversation,
    getUnreadCountsForUser,
    getTopicUnreadCountsForUser,
    getLegacyUnreadCountForUser,
    listConversationCandidatesForUser,
    mapConversationsToChatRoomDisplays,
    mapConversationToChatRoomDisplay,
    markConversationRead,
    markTopicRead,
    toggleReaction,
    updateMessage,
    updateTopic,
    validateTopicReadCursor,
} from "@/lib/data/mongo-chat";
import { ChatConversations, ChatMessageDocs, ChatRoomMembers, ChatRooms, Circles, Members } from "@/lib/data/db";
import { getCircleByDid, getCircleByHandle, getCircleById, getCirclesByDids } from "@/lib/data/circle";
import { getUserPrivate } from "@/lib/data/user";
import { sendNotifications } from "@/lib/data/notifications";
import { saveFile } from "@/lib/data/storage";
import { getAuthenticatedUserDid as getProductionAuthenticatedUserDid } from "@/lib/auth/auth";
import { extractChatMentionIds } from "@/lib/chat/mention-markup";
import { normalizeObjectIdHex, sumConversationUnreadCounts } from "@/lib/chat/topic-read-state";
import { WELCOME_MESSAGE, isSystemMessageSource } from "@/config/welcome-message";
import { normalizeSystemMessageMetadata } from "@/lib/chat/system-messages";
import { getSkillLabelByHandle } from "@/lib/data/skills";
import { canParticipate, getParticipationRequiredMessage } from "@/lib/profile-completion";
import { getDmEligibility } from "@/lib/data/relationships";
import { assertCircleWritesAllowed, canReadCircleByLifecycle } from "@/lib/data/circle-lifecycle-policy";
import { buildConversationScopedReplyFilter, CHAT_UNAVAILABLE_MESSAGE, evaluateConversationAccess } from "@/lib/chat/conversation-access-policy";
import { canReadCircle } from "@/lib/data/circle-visibility-policy";
import { loadAuthorizedConversationCandidates } from "@/lib/chat/conversation-access-batch";
import { authorizeCircleChatEntry } from "@/lib/chat/circle-chat-entry-orchestration";
import { getChatActionContext, getChatActionViewerDid, observeChatActionEffect } from "@/lib/chat/chat-action-context";

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
    const mentionIds = extractChatMentionIds(messageBody);
    if (!mentionIds.length) {
        return [];
    }

    const participantDids = new Set(
        ((conversation?.participants || []) as string[]).filter((did) => typeof did === "string" && did.length > 0),
    );
    if (!participantDids.size) {
        return [];
    }

    const mentionedDids = new Set<string>();
    await Promise.all(
        mentionIds.map(async (mentionId) => {
            const mentionLookupClauses: any[] = [{ handle: mentionId }, { did: mentionId }];
            if (ObjectId.isValid(mentionId)) {
                mentionLookupClauses.push({ _id: new ObjectId(mentionId) });
            }

            const mentionedCircle = (await Circles.findOne(
                { $or: mentionLookupClauses },
                { projection: { did: 1 } },
            )) as Circle | null;
            const mentionedDid = mentionedCircle?.did;
            if (!mentionedDid || mentionedDid === senderDid) {
                return;
            }
            if (!participantDids.has(mentionedDid)) {
                return;
            }
            mentionedDids.add(mentionedDid);
        }),
    );

    if (!mentionedDids.size) {
        return [];
    }

    return (await Promise.all(Array.from(mentionedDids).map((recipientDid) => getUserPrivate(recipientDid)))).filter(
        (recipient): recipient is any => !!recipient?.did,
    );
};

const sendConversationMessageNotifications = async ({
    conversationId,
    conversation,
    senderDid,
    messageBody,
    messageId,
}: {
    conversationId: string;
    conversation: any;
    senderDid: string;
    messageBody: string;
    messageId?: string;
}) => {
    const isDirectMessage = conversation?.type === "dm";
    const isCircleContact = conversation?.metadata?.source === CIRCLE_CONTACT_SOURCE;
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

    if (isDirectMessage || isCircleContact) {
        const recipientDids: string[] = Array.from(
            new Set(
                (conversation?.participants || []).filter(
                    (participantDid: string) =>
                        typeof participantDid === "string" &&
                        participantDid !== senderDid &&
                        !mentionRecipientDids.has(participantDid),
                ),
            ),
        );

        const recipients = (
            await Promise.all(recipientDids.map((recipientDid) => getUserPrivate(recipientDid)))
        ).filter((recipient): recipient is any => !!recipient?.did);

        if (recipients.length) {
            await sendNotifications("pm_received", recipients, {
                roomId: conversationId,
                user: sender,
                circle: isCircleContact ? circle : undefined,
                contactType: conversation?.metadata?.contactType,
                conversationName: conversation?.name,
                messagePreview: messageBody,
            });
        }
    }

    if (mentionRecipients.length) {
        await sendNotifications("chat_mention", mentionRecipients, {
            roomId: conversationId,
            user: sender,
            circle,
            conversationName: conversation?.name,
            messageBody: `${sender.name || "Someone"} mentioned you in ${conversation?.name || "chat"}`,
            messagePreview: messageBody,
        });
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
    const ownerCircle = circleId && ObjectId.isValid(circleId)
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

    const membership: any = conversation.type === "dm"
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
        const checks = await Promise.all(uniqueIds.map(async (id) => ({ id, access: await resolveMongoConversationAccess(id, userDid, intent) })));
        return new Set(checks.filter(({ access }) => access.ok).flatMap(({ id, access }) => [id, access.conversation?._id?.toString?.()].filter(Boolean) as string[]));
    }
    const objectIds = uniqueIds.filter(ObjectId.isValid).map((id) => new ObjectId(id));
    const conversations = await ChatConversations.find({
        archived: { $ne: true },
        $or: [{ _id: { $in: objectIds } }, { handle: { $in: uniqueIds } }],
    }).toArray();
    const circleIds = Array.from(
        new Set(conversations.map((conversation: any) => conversation.circleId).filter((id): id is string => typeof id === "string")),
    );
    const circleObjectIds = circleIds.filter(ObjectId.isValid).map((id) => new ObjectId(id));
    const [circles, canonicalRows, chatRows] = await Promise.all([
        circleObjectIds.length ? Circles.find({ _id: { $in: circleObjectIds } }).toArray() : Promise.resolve([]),
        circleIds.length
            ? Members.find({ userDid, circleId: { $in: circleIds } }, { projection: { circleId: 1 } }).toArray()
            : Promise.resolve([]),
        ChatRoomMembers.find(
            ({
                userDid,
                $or: [
                    { chatRoomId: { $in: uniqueIds } },
                    ...(objectIds.length ? [{ chatRoomId: { $in: objectIds } }] : []),
                ],
            } as any),
            { projection: { chatRoomId: 1, status: 1, active: 1, isActive: 1 } },
        ).toArray(),
    ]);
    const circleById = new Map(circles.map((circle: any) => [circle._id.toString(), circle]));
    const canonicalIds = new Set(canonicalRows.map((row: any) => row.circleId));
    const activeChatIds = new Set(
        chatRows.filter(isActiveGroupMembership).map((row: any) => row.chatRoomId?.toString?.() || String(row.chatRoomId)),
    );
    const allowed = new Set<string>();
    for (const conversation of conversations) {
        const id = conversation._id.toString();
        if (evaluateConversationAccess({
            conversation,
            viewerDid: userDid,
            intent,
            ownerCircle: typeof conversation.circleId === "string" ? circleById.get(conversation.circleId) : null,
            canonicalMember: typeof conversation.circleId === "string" && canonicalIds.has(conversation.circleId),
            chatMember: activeChatIds.has(id),
        })) {
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

export const listChatRoomsAction = async (): Promise<{
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
            findCanonicalMemberships: async (did) => context?.findCanonicalMemberships
                ? context.findCanonicalMemberships(did)
                : Members.find({ userDid: did }).toArray(),
            findCandidates: context?.findCandidates || listConversationCandidatesForUser,
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
        authorizedConversations.sort((a, b) =>
            (b.updatedAt ? new Date(b.updatedAt).getTime() : 0) - (a.updatedAt ? new Date(a.updatedAt).getTime() : 0),
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
        }));
        return { success: true, rooms: roomsWithUnread };
    } catch (error) {
        console.error("❌ Error listing chat rooms:", error);
        return { success: false, message: error instanceof Error ? error.message : "Failed to load chats" };
    }
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
            ? ((await ChatMessageDocs.find(buildConversationScopedReplyFilter(conversationId, replyObjectIds) as any).toArray()) as any[])
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
                ? senderByDid.get(replyDoc.senderDid) || { _id: replyDoc.senderDid, name: replyDoc.senderDid }
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
            ? ((await ChatMessageDocs.find(buildConversationScopedReplyFilter(conversationId, replyObjectIds) as any).toArray()) as any[])
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
        const doc = threadId
            ? await createThreadReply(threadId, conversationId, userDid, {
                  body: file.name,
                  attachments: [attachment],
                  replyToMessageId,
              })
            : await createMessage({
                  conversationId,
                  senderDid: userDid,
                  body: file.name,
                  createdAt: new Date(),
                  replyToMessageId,
                  attachments: [attachment],
              });
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
    if (!ObjectId.isValid(messageId)) return { success: false, message: CHAT_UNAVAILABLE_MESSAGE };

    const messageDoc = getChatActionContext()?.findMessage
        ? await getChatActionContext()!.findMessage!(messageId)
        : await ChatMessageDocs.findOne(
        { _id: new ObjectId(messageId) },
        { projection: { conversationId: 1 } },
    );
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
        : await ChatMessageDocs.findOne(
        { _id: new ObjectId(messageId) },
        { projection: { conversationId: 1 } },
    );
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
        messageDoc = (getChatActionContext()?.findMessage
            ? await getChatActionContext()!.findMessage!(messageId)
            : await ChatMessageDocs.findOne(
            { _id: new ObjectId(messageId) },
            { projection: { conversationId: 1 } },
        )) as { conversationId?: string } | null;
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
    options?: { source?: "composer" | "profile" },
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

    const source = options?.source || "composer";
    const dmEligibility = await getDmEligibility(userDid, recipient.did!);
    if (source !== "profile" && !dmEligibility.isAllowed) {
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
                ? await getChatActionContext()!.saveFile!(avatarFile, "chat-group-avatar", ownerCircle._id as string, true)
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
        loadCircle: async (id) => getChatActionContext()?.findCircle
            ? getChatActionContext()!.findCircle!(id)
            : getCircleById(id),
        canRead: async (did, value) => canReadCircle(did, value, {
            getMember: async (viewerDid, ownerId) => getChatActionContext()?.findCanonicalMember
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

    const access = await resolveMongoConversationAccess(conversationId, userDid, "write");
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
): Promise<{ success: boolean; lastReadMessageId?: string | null; message?: string }> => {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) return { success: false, message: "Not authenticated" };
    const access = await resolveMongoConversationAccess(conversationId, userDid, "write");
    if (!access.ok) return { success: false, message: access.message };
    const normalizedTopicId = normalizeObjectIdHex(topicId);
    if (!normalizedTopicId) return { success: false, message: "Invalid topic" };
    const topic = await findThreadStarter(normalizedTopicId, conversationId);
    if (!topic) return { success: false, message: "Topic not found for this conversation" };

    const validatedCursor = await validateTopicReadCursor(conversationId, normalizedTopicId, lastSeenMessageId);
    if (!validatedCursor) return { success: false, message: "Invalid topic read boundary" };
    observeChatActionEffect("topic-read-state");
    await markTopicRead(userDid, conversationId, normalizedTopicId, validatedCursor);
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
): Promise<{ success: boolean; message?: string; messageId?: string }> => {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) return { success: false, message: "Not authenticated" };
    if (!body.trim()) return { success: false, message: "Reply cannot be empty" };
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
        const doc = await sendThreadReply(threadId, conversationId, userDid, body.trim(), replyToMessageId);
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
            });
        } catch (notifError) {
            console.error("sendThreadReplyAction notification error:", notifError);
        }
        return { success: true, messageId: doc._id.toString() };
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
            const replyAuthorCircle = replyDoc ? senderByDid.get(replyDoc.senderDid) : undefined;
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
            const author =
                (shouldUseSystemTemplateAuthor ? fallbackSystemAuthor : senderByDid.get(doc.senderDid)) ||
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
