// chat/actions.ts - server actions for joining chat rooms
"use server";

import { ObjectId } from "mongodb";
import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import { Circle, ChatRoomMember, ChatRoom, ChatRoomDisplay, UserPrivate } from "@/models/models";
import { getAllUsers, getUserByDid } from "@/lib/data/user";
import {
    addChatRoomMember,
    getChatRoom,
    getChatRoomMember,
    removeChatRoomMember,
} from "@/lib/data/chat";
import { ChatConversations, ChatRoomMembers, Circles, Members } from "@/lib/data/db";
import { features } from "@/lib/data/constants";
import { getCirclesByDids } from "@/lib/data/circle";
import { ensureConversationForCircle, listConversationMedia } from "@/lib/data/mongo-chat";
import { emitGroupChatMembershipSystemEvent } from "@/lib/data/system-message-events";
import {
    listChatRoomsAction as listMongoChatRoomsAction,
    fetchMongoMessagesAction as fetchMongoMessagesActionInternal,
    sendMongoMessageAction as sendMongoMessageActionInternal,
    sendMongoAttachmentAction as sendMongoAttachmentActionInternal,
    editMongoMessageAction as editMongoMessageActionInternal,
    deleteMongoMessageAction as deleteMongoMessageActionInternal,
    toggleMongoReactionAction as toggleMongoReactionActionInternal,
    findOrCreateDMConversationAction as findOrCreateDMConversationActionInternal,
    createMongoGroupChatAction as createMongoGroupChatActionInternal,
    getUnreadCountsAction as getUnreadCountsActionInternal,
    markConversationReadAction as markConversationReadActionInternal,
    resolveMongoConversationAccess as resolveMongoConversationAccessInternal,
} from "./mongo-actions";

const isActiveChatRoomMembership = (membership: any): boolean => {
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

const getMembershipJoinedAt = (membership: any): number => {
    if (!membership?.joinedAt) return Number.MAX_SAFE_INTEGER;
    const timestamp = new Date(membership.joinedAt).getTime();
    return Number.isNaN(timestamp) ? Number.MAX_SAFE_INTEGER : timestamp;
};

const isRequesterAdmin = (userDid: string, members: any[]): boolean => {
    const requester = members.find((member) => member.userDid === userDid);
    if (!requester) return false;

    if (requester.role === "admin") {
        return true;
    }

    const hasExplicitAdmin = members.some((member) => member.role === "admin");
    if (hasExplicitAdmin) {
        return false;
    }

    // Backward-compat fallback for legacy rooms without role data:
    // treat the earliest joined member as the effective admin.
    const earliestMember = members.reduce(
        (earliest, current) =>
            getMembershipJoinedAt(current) < getMembershipJoinedAt(earliest) ? current : earliest,
        members[0],
    );

    return earliestMember?.userDid === userDid;
};

const buildMongoMembershipQuery = (chatRoomId: string): Record<string, unknown> => {
    if (!ObjectId.isValid(chatRoomId)) {
        return { chatRoomId };
    }
    return {
        $or: [{ chatRoomId }, { chatRoomId: new ObjectId(chatRoomId) }],
    };
};

const getMongoConversation = async (chatRoomId: string) => {
    if (!ObjectId.isValid(chatRoomId)) return null;
    return await ChatConversations.findOne({
        _id: new ObjectId(chatRoomId),
        archived: { $ne: true },
    });
};

const listMongoChatRoomMembers = async (chatRoomId: string): Promise<any[]> => {
    return await ChatRoomMembers.find(buildMongoMembershipQuery(chatRoomId)).toArray();
};

const canUserEditGroupInfo = async (chatRoomId: string, userDid: string): Promise<boolean> => {
    const members = await listMongoChatRoomMembers(chatRoomId);
    const activeMembers = members.filter(isActiveChatRoomMembership);
    return isRequesterAdmin(userDid, activeMembers);
};

export async function joinChatRoomAction(
    chatRoomId: string,
): Promise<{ success: boolean; message?: string; chatRoomMember?: ChatRoomMember }> {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "You need to be logged in to join a chat room" };
    }

    try {
        const chatRoom = await getChatRoom(chatRoomId);
        if (!chatRoom) {
            return { success: false, message: "Chat room not found" };
        }

        if (!chatRoom.circleId) {
            return { success: false, message: "Chat room not found" };
        }

        const circleId = chatRoom.circleId;
        const authorized = await isAuthorized(userDid, circleId, features.chat.view);
        if (!authorized) {
            return { success: false, message: "You are not authorized to join this chat room" };
        }

        const existingMembership = await getChatRoomMember(userDid, chatRoomId);
        const wasAlreadyActive = isActiveChatRoomMembership(existingMembership);
        const chatRoomMember = await addChatRoomMember(userDid, chatRoomId);
        if (!wasAlreadyActive) {
            const conversation = await getMongoConversation(chatRoomId);
            if (conversation?.type === "group") {
                await emitGroupChatMembershipSystemEvent({
                    conversationId: chatRoomId,
                    eventType: "group_chat_joined",
                    actorDid: userDid,
                    targetDid: userDid,
                });
            }
        }

        return { success: true, message: "Joined chat room successfully", chatRoomMember };
    } catch (error) {
        console.error("Error in joinChatRoomAction:", error);
        return { success: false, message: error instanceof Error ? error.message : "Failed to join chat room." };
    }
}

export async function leaveChatRoomAction(chatRoomId: string): Promise<{ success: boolean; message?: string }> {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "You need to be logged in to leave a chat room" };
    }

    try {
        const chatRoom = await getChatRoom(chatRoomId);
        if (!chatRoom) {
            return { success: false, message: "Chat room not found" };
        }

        // Check if the user is a member of the chat room
        const chatRoomMember = await getChatRoomMember(userDid, chatRoomId);
        if (!chatRoomMember) {
            return { success: false, message: "You are not a member of this chat room" };
        }
        const wasActiveMember = isActiveChatRoomMembership(chatRoomMember);

        // Remove the user from the chat room
        await removeChatRoomMember(userDid, chatRoomId);
        if (wasActiveMember) {
            const conversation = await getMongoConversation(chatRoomId);
            if (conversation?.type === "group") {
                await emitGroupChatMembershipSystemEvent({
                    conversationId: chatRoomId,
                    eventType: "group_chat_left",
                    actorDid: userDid,
                    targetDid: userDid,
                });
            }
        }

        return { success: true, message: "Left chat room successfully" };
    } catch (error) {
        console.error("Error in leaveChatRoomAction:", error);
        return { success: false, message: error instanceof Error ? error.message : "Failed to leave chat room." };
    }
}



export const findOrCreateDMRoomAction = async (
    inRecipient: Circle,
): Promise<{ success: boolean; message?: string; chatRoom?: ChatRoom; user?: UserPrivate }> => {
    const result = await findOrCreateDMConversationActionInternal(inRecipient);
    return { success: result.success, message: result.message, chatRoom: result.chatRoom as ChatRoom };
};

export const getAllUsersAction = async (): Promise<Circle[]> => {
    return await getAllUsers();
};

export const getChatContactsAction = async (): Promise<Circle[]> => {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return [];
    }

    try {
        const contactDids = new Set<string>();
        const currentUser = await getUserByDid(userDid);
        const currentUserCircleId = currentUser?._id ? String(currentUser._id) : undefined;

        const outgoingMemberships = await Members.find(
            { userDid },
            { projection: { circleId: 1 } },
        ).toArray();
        const followedUserCircleIds = Array.from(
            new Set(
                outgoingMemberships
                    .map((membership: any) => (typeof membership?.circleId === "string" ? membership.circleId : undefined))
                    .filter((circleId): circleId is string => !!circleId && ObjectId.isValid(circleId)),
            ),
        );

        if (followedUserCircleIds.length > 0) {
            const followedObjectIds = followedUserCircleIds.map((circleId) => new ObjectId(circleId));
            const followedUsers = await Circles.find(
                {
                    _id: { $in: followedObjectIds },
                    circleType: "user",
                    did: { $ne: userDid },
                },
                { projection: { did: 1 } },
            ).toArray();

            for (const followedUser of followedUsers) {
                if (followedUser?.did) {
                    contactDids.add(String(followedUser.did));
                }
            }
        }

        if (currentUserCircleId) {
            const incomingMemberships = await Members.find(
                { circleId: currentUserCircleId, userDid: { $ne: userDid } },
                { projection: { userDid: 1 } },
            ).toArray();

            for (const follower of incomingMemberships) {
                if (follower?.userDid) {
                    contactDids.add(String(follower.userDid));
                }
            }
        }

        const dmConversations = await ChatConversations.find(
            {
                type: "dm",
                participants: userDid,
                archived: { $ne: true },
            },
            { projection: { participants: 1 } },
        ).toArray();

        for (const conversation of dmConversations) {
            for (const participantDid of (conversation as any)?.participants || []) {
                if (participantDid && participantDid !== userDid) {
                    contactDids.add(String(participantDid));
                }
            }
        }

        if (contactDids.size === 0) {
            return [];
        }

        const contacts = await getCirclesByDids(Array.from(contactDids));
        return contacts
            .filter((contact) => contact?.circleType === "user" && contact?.did && contact.did !== userDid)
            .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    } catch (error) {
        console.error("❌ Error fetching chat contacts:", error);
        return [];
    }
};

export const listChatRoomsAction = async (): Promise<{ success: boolean; rooms?: ChatRoomDisplay[]; message?: string }> => {
    return await listMongoChatRoomsAction();
};

export const fetchMongoMessagesAction = async (
    conversationId: string,
    sinceId?: string,
    limit: number = 50,
) => {
    return await fetchMongoMessagesActionInternal(conversationId, sinceId, limit);
};

export const sendMongoMessageAction = async (
    conversationId: string,
    content: string,
    replyToMessageId?: string,
    format?: "markdown",
) => {
    return await sendMongoMessageActionInternal(conversationId, content, replyToMessageId, format);
};

export const sendMongoAttachmentAction = async (formData: FormData) => {
    return await sendMongoAttachmentActionInternal(formData);
};

export const editMongoMessageAction = async (messageId: string, content: string) => {
    return await editMongoMessageActionInternal(messageId, content);
};

export const deleteMongoMessageAction = async (messageId: string) => {
    return await deleteMongoMessageActionInternal(messageId);
};

export const toggleMongoReactionAction = async (messageId: string, emoji: string) => {
    return await toggleMongoReactionActionInternal(messageId, emoji);
};

export const findOrCreateDMConversationAction = async (inRecipient: Circle) => {
    return await findOrCreateDMConversationActionInternal(inRecipient);
};

export const createMongoGroupChatAction = async (formData: FormData) => {
    return await createMongoGroupChatActionInternal(formData);
};

export const ensureCircleConversationAction = async (
    circleId: string,
): Promise<{ success: boolean; roomId?: string; message?: string }> => {
    try {
        const conversation = await ensureConversationForCircle(circleId);
        return { success: true, roomId: conversation._id as string };
    } catch (error) {
        console.error("❌ Error ensuring circle conversation:", error);
        return { success: false, message: error instanceof Error ? error.message : "Failed to ensure circle chat" };
    }
};

export const getUnreadCountsAction = async (conversationIds: string[]) => {
    return await getUnreadCountsActionInternal(conversationIds);
};

export const markConversationReadAction = async (conversationId: string, lastSeenMessageId: string | null) => {
    return await markConversationReadActionInternal(conversationId, lastSeenMessageId);
};

export const listConversationMediaAction = async (
    conversationId: string,
    kind?: "image" | "video" | "file",
    limit: number = 50,
): Promise<{
    success: boolean;
    media?: Awaited<ReturnType<typeof listConversationMedia>>;
    message?: string;
}> => {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "You need to be logged in to view media" };
    }

    const access = await resolveMongoConversationAccessInternal(conversationId, userDid);
    if (!access.ok) {
        return { success: false, message: access.message };
    }

    try {
        const media = await listConversationMedia(conversationId, kind, limit);
        return { success: true, media };
    } catch (error) {
        console.error("❌ Error listing conversation media:", error);
        return { success: false, message: error instanceof Error ? error.message : "Failed to load media" };
    }
};

export const sendMessageAction = async (
    roomId: string,
    content: string,
    replyToEventId?: string
): Promise<{ success: boolean; message?: string; eventId?: string }> => {
    const result = await sendMongoMessageActionInternal(roomId, content, replyToEventId);
    return { success: result.success, message: result.message, eventId: result.messageId };
};

export const fetchRoomMessagesAction = async (
    roomId: string,
    limit: number = 50
): Promise<{ success: boolean; messages?: any[]; message?: string }> => {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "You need to be logged in to fetch messages" };
    }
    const result = await fetchMongoMessagesActionInternal(roomId, undefined, limit);
    return { success: result.success, messages: result.messages, message: result.message };
};



export const sendAttachmentAction = async (
    formData: FormData
): Promise<{ success: boolean; message?: string; eventId?: string }> => {
    const result = await sendMongoAttachmentActionInternal(formData);
    return { success: result.success, message: result.message, eventId: result.messageId };
};

export const editMessageAction = async (
    roomId: string,
    eventId: string,
    newContent: string
): Promise<{ success: boolean; message?: string }> => {
    return await editMongoMessageActionInternal(eventId, newContent);
};

export const deleteMessageAction = async (
    roomId: string,
    eventId: string
): Promise<{ success: boolean; message?: string }> => {
    return await deleteMongoMessageActionInternal(eventId);
};

export const createGroupChatAction = async (
    formData: FormData
): Promise<{ success: boolean; roomId?: string; message?: string }> => {
    return await createMongoGroupChatActionInternal(formData);
};

export const sendReadReceiptAction = async (
    roomId: string,
    eventId: string
): Promise<{ success: boolean; message?: string }> => {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "You need to be logged in to send read receipts" };
    }

    // Read receipts are handled by the Mongo chat pipeline.
    return { success: true };
};

export const deleteGroupChatAction = async (
    chatRoomId: string
): Promise<{ success: boolean; message?: string }> => {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "You need to be logged in to delete a group" };
    }
    try {
        const conversation = await getMongoConversation(chatRoomId);
        if (!conversation) {
            return { success: false, message: "Chat room not found" };
        }
        if (conversation.type === "dm") {
            return { success: false, message: "Cannot delete a direct message" };
        }

        const members = (await listMongoChatRoomMembers(chatRoomId)).filter(isActiveChatRoomMembership);
        if (!isRequesterAdmin(userDid, members)) {
            return { success: false, message: "Only admins can delete groups" };
        }

        await ChatRoomMembers.updateMany(
            buildMongoMembershipQuery(chatRoomId),
            { $set: { status: "removed", active: false, isActive: false } as any },
        );
        await ChatConversations.updateOne(
            { _id: new ObjectId(chatRoomId) },
            { $set: { archived: true, updatedAt: new Date() } },
        );

        return { success: true };
    } catch (error) {
        console.error("❌ Error deleting group chat:", error);
        return { success: false, message: error instanceof Error ? error.message : "Failed to delete group" };
    }
};

export const leaveGroupChatAction = async (
    chatRoomId: string
): Promise<{ success: boolean; message?: string }> => {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "You need to be logged in to leave a group" };
    }

    try {
        const conversation = await getMongoConversation(chatRoomId);
        if (!conversation) {
            return { success: false, message: "Chat room not found" };
        }
        if (conversation.type === "dm") {
            return { success: false, message: "Cannot leave a direct message" };
        }

        const membershipBeforeLeave = await ChatRoomMembers.findOne({ userDid, ...buildMongoMembershipQuery(chatRoomId) });
        const wasActiveMember = isActiveChatRoomMembership(membershipBeforeLeave);

        await ChatRoomMembers.updateMany(
            { userDid, ...buildMongoMembershipQuery(chatRoomId) },
            { $set: { status: "left", active: false, isActive: false } as any },
        );
        await ChatConversations.updateOne(
            { _id: new ObjectId(chatRoomId) },
            { $set: { updatedAt: new Date() } },
        );
        if (wasActiveMember) {
            await emitGroupChatMembershipSystemEvent({
                conversationId: chatRoomId,
                eventType: "group_chat_left",
                actorDid: userDid,
                targetDid: userDid,
            });
        }
        return { success: true };
    } catch (error) {
        console.error("❌ Error leaving group chat:", error);
        return { success: false, message: error instanceof Error ? error.message : "Failed to leave group" };
    }
};

export const updateGroupInfoAction = async (
    chatRoomId: string,
    updates: { name?: string; description?: string }
): Promise<{ success: boolean; message?: string }> => {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "You need to be logged in to update group info" };
    }

    try {
        const conversation = await getMongoConversation(chatRoomId);
        if (!conversation) {
            return { success: false, message: "Chat room not found" };
        }
        if (conversation.type === "dm") {
            return { success: false, message: "Cannot update a direct message" };
        }

        const canEdit = await canUserEditGroupInfo(chatRoomId, userDid);
        if (!canEdit) {
            return { success: false, message: "You are not authorized to update group info" };
        }

        const conversationUpdates: Record<string, any> = { updatedAt: new Date() };
        if (typeof updates.name === "string") {
            conversationUpdates.name = updates.name;
        }
        if (typeof updates.description === "string") {
            conversationUpdates.description = updates.description;
        }

        await ChatConversations.updateOne({ _id: new ObjectId(chatRoomId) }, { $set: conversationUpdates });

        return { success: true };
    } catch (error) {
        console.error("❌ Error updating group info:", error);
        return { success: false, message: error instanceof Error ? error.message : "Failed to update group info" };
    }
};

export const canEditGroupInfoAction = async (
    chatRoomId: string,
): Promise<{ success: boolean; isAdmin?: boolean; message?: string }> => {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "You need to be logged in" };
    }

    try {
        const conversation = await getMongoConversation(chatRoomId);
        if (!conversation) {
            return { success: false, message: "Chat room not found" };
        }
        if (conversation.type === "dm") {
            return { success: true, isAdmin: false };
        }

        const canEdit = await canUserEditGroupInfo(chatRoomId, userDid);
        return { success: true, isAdmin: canEdit };
    } catch (error) {
        console.error("❌ Error checking group edit permissions:", error);
        return { success: false, message: error instanceof Error ? error.message : "Failed to check permissions" };
    }
};

export const updateGroupAvatarAction = async (
    formData: FormData
): Promise<{ success: boolean; message?: string; pictureUrl?: string }> => {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "You need to be logged in to update group avatar" };
    }

    const chatRoomId = formData.get("chatRoomId") as string;
    const file = formData.get("file") as File;

    if (!chatRoomId || !file) {
        return { success: false, message: "Missing chat room ID or file" };
    }

    // Enforce 5MB limit
    const MAX_SIZE = 5 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
        return { success: false, message: "File size exceeds 5MB limit" };
    }

    try {
        const conversation = await getMongoConversation(chatRoomId);
        if (!conversation) {
            return { success: false, message: "Chat room not found" };
        }
        if (conversation.type === "dm") {
            return { success: false, message: "Cannot update avatar for direct messages" };
        }

        const members = (await listMongoChatRoomMembers(chatRoomId)).filter(isActiveChatRoomMembership);
        if (!isRequesterAdmin(userDid, members)) {
            return { success: false, message: "You are not authorized to update the group avatar" };
        }

        const { saveFile } = await import("@/lib/data/storage");
        const { getCircleByDid, getCircleById } = await import("@/lib/data/circle");
        const ownerCircle = conversation.circleId ? await getCircleById(conversation.circleId) : await getCircleByDid(userDid);
        if (!ownerCircle?._id) {
            return { success: false, message: "Could not resolve storage owner" };
        }

        const fileInfo = await saveFile(file, "chat-group-avatar", ownerCircle._id as string, true);
        await ChatConversations.updateOne(
            { _id: new ObjectId(chatRoomId) },
            { $set: { picture: { url: fileInfo.url }, updatedAt: new Date() } as any },
        );

        return { success: true, pictureUrl: fileInfo.url };
    } catch (error) {
        console.error("❌ Error updating group avatar:", error);
        return { success: false, message: error instanceof Error ? error.message : "Failed to update group avatar" };
    }
};

export const getActiveChatRoomMemberCountAction = async (
    chatRoomId: string,
): Promise<{ success: boolean; memberCount?: number; message?: string }> => {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "You need to be logged in" };
    }

    try {
        const conversation = await getMongoConversation(chatRoomId);
        if (!conversation) {
            return { success: false, message: "Chat room not found" };
        }
        if (conversation.type === "dm") {
            return { success: true, memberCount: 0 };
        }

        const members = await listMongoChatRoomMembers(chatRoomId);
        const activeMemberCount = members.filter(isActiveChatRoomMembership).length;

        return { success: true, memberCount: activeMemberCount };
    } catch (error) {
        console.error("❌ Error fetching active member count:", error);
        return { success: false, message: error instanceof Error ? error.message : "Failed to fetch member count" };
    }
};

export const getChatRoomMembersAction = async (
    chatRoomId: string
): Promise<{ success: boolean; members?: any[]; message?: string }> => {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "You need to be logged in" };
    }

    try {
        const conversation = await getMongoConversation(chatRoomId);
        if (!conversation) {
            return { success: false, message: "Chat room not found" };
        }
        if (conversation.type === "dm") {
            return { success: true, members: [] };
        }

        const access = await resolveMongoConversationAccessInternal(chatRoomId, userDid);
        if (!access.ok) {
            return { success: false, message: access.message };
        }

        let members = (await listMongoChatRoomMembers(chatRoomId)).filter(isActiveChatRoomMembership);
        const hasAdmin = members.some((member) => member.role === "admin");
        if (!hasAdmin && members.length > 0) {
            const earliestMember = members.reduce((prev, current) =>
                new Date(prev.joinedAt).getTime() <= new Date(current.joinedAt).getTime() ? prev : current,
            );
            await ChatRoomMembers.updateOne(
                { userDid: earliestMember.userDid, ...buildMongoMembershipQuery(chatRoomId) },
                { $set: { role: "admin", status: "active", active: true, isActive: true } as any },
            );
            members = members.map((member) =>
                member.userDid === earliestMember.userDid ? { ...member, role: "admin" } : member,
            );
        }

        const membersWithDetails = await Promise.all(
            members.map(async (member) => {
                const user = await getUserByDid(member.userDid);
                return {
                    ...member,
                    _id: member._id?.toString?.() || member._id,
                    role: member.role || "member",
                    user: user
                        ? {
                              did: user.did,
                              name: user.name,
                              handle: user.handle,
                              picture: user.picture,
                          }
                        : null,
                };
            }),
        );

        return { success: true, members: membersWithDetails };
    } catch (error) {
        console.error("❌ Error fetching chat room members:", error);
        return { success: false, message: error instanceof Error ? error.message : "Failed to fetch members" };
    }
};




export const addMembersAction = async (
    chatRoomId: string,
    memberDids: string[]
): Promise<{ success: boolean; message?: string }> => {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "You need to be logged in" };
    }

    try {
        const conversation = await getMongoConversation(chatRoomId);
        if (!conversation) {
            return { success: false, message: "Chat room not found" };
        }
        if (conversation.type === "dm") {
            return { success: false, message: "Cannot add members to a direct message" };
        }

        const members = (await listMongoChatRoomMembers(chatRoomId)).filter(isActiveChatRoomMembership);
        if (!isRequesterAdmin(userDid, members)) {
            return { success: false, message: "Only admins can add members" };
        }

        const uniqueMemberDids = Array.from(new Set(memberDids.filter(Boolean)));
        const existingActiveMemberDids = new Set(
            members.map((member) => (typeof member?.userDid === "string" ? member.userDid : "")),
        );
        const memberDidsNewlyActivated = uniqueMemberDids.filter((did) => !existingActiveMemberDids.has(did));
        const now = new Date();
        for (const newMemberDid of uniqueMemberDids) {
            await ChatRoomMembers.updateOne(
                { userDid: newMemberDid, ...buildMongoMembershipQuery(chatRoomId) },
                {
                    $setOnInsert: {
                        userDid: newMemberDid,
                        chatRoomId,
                        joinedAt: now,
                        role: "member",
                    },
                    $set: { status: "active", active: true, isActive: true } as any,
                },
                { upsert: true },
            );
        }

        await ChatConversations.updateOne(
            { _id: new ObjectId(chatRoomId) },
            { $addToSet: { participants: { $each: uniqueMemberDids } }, $set: { updatedAt: now } },
        );
        for (const targetDid of memberDidsNewlyActivated) {
            await emitGroupChatMembershipSystemEvent({
                conversationId: chatRoomId,
                eventType: "group_chat_member_added",
                actorDid: userDid,
                targetDid,
            });
        }

        return { success: true };
    } catch (error) {
        console.error("❌ Error adding members:", error);
        return { success: false, message: error instanceof Error ? error.message : "Failed to add members" };
    }
};

export const removeMemberAction = async (
    chatRoomId: string,
    memberDid: string
): Promise<{ success: boolean; message?: string }> => {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "You need to be logged in" };
    }

    try {
        const conversation = await getMongoConversation(chatRoomId);
        if (!conversation) {
            return { success: false, message: "Chat room not found" };
        }
        if (conversation.type === "dm") {
            return { success: false, message: "Cannot remove members from a direct message" };
        }

        const members = (await listMongoChatRoomMembers(chatRoomId)).filter(isActiveChatRoomMembership);
        if (!isRequesterAdmin(userDid, members)) {
            return { success: false, message: "Only admins can remove members" };
        }
        if (memberDid === userDid) {
            return { success: false, message: "Use the leave option to remove yourself" };
        }
        const targetMemberships = members.filter((member) => member.userDid === memberDid);
        if (targetMemberships.length === 0) {
            return { success: false, message: "Member not found" };
        }
        const targetMembershipIds = targetMemberships.map((member) => member._id).filter(Boolean);

        if (targetMembershipIds.length > 0) {
            await ChatRoomMembers.updateMany(
                { _id: { $in: targetMembershipIds } },
                { $set: { status: "removed", active: false, isActive: false } as any },
            );
        } else {
            await ChatRoomMembers.updateMany(
                { userDid: memberDid, ...buildMongoMembershipQuery(chatRoomId) },
                { $set: { status: "removed", active: false, isActive: false } as any },
            );
        }
        await ChatConversations.updateOne(
            { _id: new ObjectId(chatRoomId) },
            { $set: { updatedAt: new Date() } },
        );
        await emitGroupChatMembershipSystemEvent({
            conversationId: chatRoomId,
            eventType: "group_chat_member_removed",
            actorDid: userDid,
            targetDid: memberDid,
        });

        return { success: true };
    } catch (error) {
        console.error("❌ Error removing member:", error);
        return { success: false, message: error instanceof Error ? error.message : "Failed to remove member" };
    }
};

export const promoteMemberAction = async (
    chatRoomId: string,
    targetUserDid: string
): Promise<{ success: boolean; message?: string }> => {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "You need to be logged in" };
    }

    try {
        const conversation = await getMongoConversation(chatRoomId);
        if (!conversation) {
            return { success: false, message: "Chat room not found" };
        }
        if (conversation.type === "dm") {
            return { success: false, message: "Cannot promote members in a direct message" };
        }

        const members = (await listMongoChatRoomMembers(chatRoomId)).filter(isActiveChatRoomMembership);
        if (!isRequesterAdmin(userDid, members)) {
            return { success: false, message: "Only admins can promote members" };
        }
        const targetMemberships = members.filter((member) => member.userDid === targetUserDid);
        if (targetMemberships.length === 0) {
            return { success: false, message: "Member not found" };
        }
        const alreadyAdmin = targetMemberships.some((member) => member.role === "admin");
        if (alreadyAdmin) {
            return { success: true };
        }
        const targetMembershipIds = targetMemberships.map((member) => member._id).filter(Boolean);

        if (targetMembershipIds.length > 0) {
            await ChatRoomMembers.updateMany(
                { _id: { $in: targetMembershipIds } },
                { $set: { role: "admin" } },
            );
        } else {
            await ChatRoomMembers.updateOne(
                { userDid: targetUserDid, ...buildMongoMembershipQuery(chatRoomId) },
                { $set: { role: "admin" } },
            );
        }
        await ChatConversations.updateOne(
            { _id: new ObjectId(chatRoomId) },
            { $set: { updatedAt: new Date() } },
        );
        await emitGroupChatMembershipSystemEvent({
            conversationId: chatRoomId,
            eventType: "group_chat_admin_promoted",
            actorDid: userDid,
            targetDid: targetUserDid,
        });

        return { success: true };
    } catch (error) {
        console.error("❌ Error promoting member:", error);
        return { success: false, message: error instanceof Error ? error.message : "Failed to promote member" };
    }
};
