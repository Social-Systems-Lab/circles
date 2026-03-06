// chat/actions.ts - server actions for joining chat rooms
"use server";

import { ObjectId } from "mongodb";
import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import { Circle, ChatRoomMember, ChatRoom, ChatRoomDisplay, UserPrivate } from "@/models/models";
import {
    getAllUsers,
    getPrivateUserByDid,
    getUserByDid,
    getUserPrivate,
} from "@/lib/data/user";
import {
    addChatRoomMember,
    findOrCreateDMRoom,
    getChatRoom,
    getChatRoomMember,
    removeChatRoomMember,
} from "@/lib/data/chat";
import { ChatConversations, ChatRoomMembers, Circles, Members } from "@/lib/data/db";
import { features } from "@/lib/data/constants";
import { getCirclesByDids } from "@/lib/data/circle";
import { ensureConversationForCircle, listConversationMedia } from "@/lib/data/mongo-chat";
import { listChatRoomsForUser } from "@/lib/data/chat";
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

const getChatProvider = () => "mongo";

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
    if (getChatProvider() === "mongo") {
        const members = await listMongoChatRoomMembers(chatRoomId);
        const activeMembers = members.filter(isActiveChatRoomMembership);
        return isRequesterAdmin(userDid, activeMembers);
    }
    const { getChatRoomMembers } = await import("@/lib/data/chat");
    const members = await getChatRoomMembers(chatRoomId);
    return isRequesterAdmin(userDid, members as any[]);
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

        const chatRoomMember = await addChatRoomMember(userDid, chatRoomId);

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

        // Remove the user from the chat room
        await removeChatRoomMember(userDid, chatRoomId);

        return { success: true, message: "Left chat room successfully" };
    } catch (error) {
        console.error("Error in leaveChatRoomAction:", error);
        return { success: false, message: error instanceof Error ? error.message : "Failed to leave chat room." };
    }
}



export const findOrCreateDMRoomAction = async (
    inRecipient: Circle,
): Promise<{ success: boolean; message?: string; chatRoom?: ChatRoom; user?: UserPrivate }> => {
    const provider = getChatProvider();
    if (provider === "mongo") {
        const result = await findOrCreateDMConversationActionInternal(inRecipient);
        return { success: result.success, message: result.message, chatRoom: result.chatRoom as ChatRoom };
    }

    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "You need to be logged in to send PM" };
    }

    let recipient = inRecipient?.did ? await getUserByDid(inRecipient?.did) : undefined;
    if (!recipient) {
        return { success: false, message: "Could not find recipient" };
    }

    const user = await getUserByDid(userDid);
    if (user._id === recipient._id) {
        return { success: false, message: "You cannot send a message to yourself" };
    }

    let room = await findOrCreateDMRoom(user, recipient);
    let userPrivate = await getUserPrivate(userDid);

    return { success: true, message: "DM room created", chatRoom: room, user: userPrivate };
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
    const provider = getChatProvider();
    if (provider === "mongo") {
        return await listMongoChatRoomsAction();
    }

    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "You need to be logged in to view chats" };
    }

    try {
        const rooms = await listChatRoomsForUser(userDid);
        return { success: true, rooms };
    } catch (error) {
        console.error("❌ Error listing chat rooms:", error);
        return { success: false, message: error instanceof Error ? error.message : "Failed to load chats" };
    }
};

export const fetchMongoMessagesAction = async (
    conversationId: string,
    sinceId?: string,
    limit: number = 50,
) => {
    const provider = getChatProvider();
    if (provider !== "mongo") {
        return { success: false, message: "Mongo chat is disabled in this environment." };
    }
    return await fetchMongoMessagesActionInternal(conversationId, sinceId, limit);
};

export const sendMongoMessageAction = async (
    conversationId: string,
    content: string,
    replyToMessageId?: string,
    format?: "markdown",
) => {
    const provider = getChatProvider();
    if (provider !== "mongo") {
        return { success: false, message: "Mongo chat is disabled in this environment." };
    }
    return await sendMongoMessageActionInternal(conversationId, content, replyToMessageId, format);
};

export const sendMongoAttachmentAction = async (formData: FormData) => {
    const provider = getChatProvider();
    if (provider !== "mongo") {
        return { success: false, message: "Mongo chat is disabled in this environment." };
    }
    return await sendMongoAttachmentActionInternal(formData);
};

export const editMongoMessageAction = async (messageId: string, content: string) => {
    const provider = getChatProvider();
    if (provider !== "mongo") {
        return { success: false, message: "Mongo chat is disabled in this environment." };
    }
    return await editMongoMessageActionInternal(messageId, content);
};

export const deleteMongoMessageAction = async (messageId: string) => {
    const provider = getChatProvider();
    if (provider !== "mongo") {
        return { success: false, message: "Mongo chat is disabled in this environment." };
    }
    return await deleteMongoMessageActionInternal(messageId);
};

export const toggleMongoReactionAction = async (messageId: string, emoji: string) => {
    const provider = getChatProvider();
    if (provider !== "mongo") {
        return { success: false, message: "Mongo chat is disabled in this environment." };
    }
    return await toggleMongoReactionActionInternal(messageId, emoji);
};

export const findOrCreateDMConversationAction = async (inRecipient: Circle) => {
    const provider = getChatProvider();
    if (provider !== "mongo") {
        return { success: false, message: "Mongo chat is disabled in this environment." };
    }
    return await findOrCreateDMConversationActionInternal(inRecipient);
};

export const createMongoGroupChatAction = async (formData: FormData) => {
    const provider = getChatProvider();
    if (provider !== "mongo") {
        return { success: false, message: "Mongo chat is disabled in this environment." };
    }
    return await createMongoGroupChatActionInternal(formData);
};

export const ensureCircleConversationAction = async (
    circleId: string,
): Promise<{ success: boolean; roomId?: string; message?: string }> => {
    const provider = getChatProvider();
    if (provider !== "mongo") {
        return { success: false, message: "Mongo chat is disabled in this environment." };
    }

    try {
        const conversation = await ensureConversationForCircle(circleId);
        return { success: true, roomId: conversation._id as string };
    } catch (error) {
        console.error("❌ Error ensuring circle conversation:", error);
        return { success: false, message: error instanceof Error ? error.message : "Failed to ensure circle chat" };
    }
};

export const getUnreadCountsAction = async (conversationIds: string[]) => {
    const provider = getChatProvider();
    if (provider !== "mongo") {
        return { success: false, message: "Mongo chat is disabled in this environment." };
    }
    return await getUnreadCountsActionInternal(conversationIds);
};

export const markConversationReadAction = async (conversationId: string, lastSeenMessageId: string | null) => {
    const provider = getChatProvider();
    if (provider !== "mongo") {
        return { success: false, message: "Mongo chat is disabled in this environment." };
    }
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
    const provider = getChatProvider();
    if (provider !== "mongo") {
        return { success: false, message: "Mongo chat is disabled in this environment." };
    }

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
    const provider = getChatProvider();
    if (provider === "mongo") {
        return await createMongoGroupChatActionInternal(formData);
    }

    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "You need to be logged in to create a group chat" };
    }

    const name = formData.get("name") as string;
    const participantDidsJson = formData.get("participants") as string;
    const avatarFile = formData.get("avatar") as File | null;

    if (!name || !participantDidsJson) {
        return { success: false, message: "Missing group name or participants" };
    }

    let participantDids: string[] = [];
    try {
        participantDids = JSON.parse(participantDidsJson);
    } catch (e) {
        return { success: false, message: "Invalid participants data" };
    }

    try {

        // Create the chat room in our local database (Mongo-only)
        const { createGroupChatRoom } = await import("@/lib/data/chat");
        const room = await createGroupChatRoom(name, userDid, participantDids);

        return { success: true, roomId: room._id };
    } catch (error) {
        console.error("❌ Error creating group chat:", error);
        return { success: false, message: error instanceof Error ? error.message : "Failed to create group chat" };
    }
};

export const sendReadReceiptAction = async (
    roomId: string,
    eventId: string
): Promise<{ success: boolean; message?: string }> => {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "You need to be logged in to send read receipts" };
    }

    // Mongo-only: read receipts are handled in Mongo (no Matrix side-effects)
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
        if (getChatProvider() === "mongo") {
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
        }

        const chatRoom = await getChatRoom(chatRoomId);
        if (!chatRoom) {
            return { success: false, message: "Chat room not found" };
        }

        if (chatRoom.isDirect) {
            return { success: false, message: "Cannot delete a direct message" };
        }

        // TODO: Check if user is admin
        // For now, we'll allow any member to delete (should be restricted to admins)

        // Delete from Matrix (admin action)
        // Note: This requires admin privileges, so we'll need to use admin token
        // For now, we'll just remove all members and mark as deleted in our DB
        
        // Remove all members from the chat room
        const members = await import("@/lib/data/chat").then(m => m.getChatRoomMembers(chatRoomId));
        for (const member of members) {
            await removeChatRoomMember(member.userDid, chatRoomId);
        }

        // Mark chat room as deleted (soft delete)
        await import("@/lib/data/chat").then(m => m.updateChatRoom({
            _id: chatRoomId,
            name: "[Deleted Group]",
            // Add a deleted flag if we have one in the schema
        }));

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
        if (getChatProvider() === "mongo") {
            const conversation = await getMongoConversation(chatRoomId);
            if (!conversation) {
                return { success: false, message: "Chat room not found" };
            }
            if (conversation.type === "dm") {
                return { success: false, message: "Cannot leave a direct message" };
            }

            await ChatRoomMembers.updateMany(
                { userDid, ...buildMongoMembershipQuery(chatRoomId) },
                { $set: { status: "left", active: false, isActive: false } as any },
            );
            await ChatConversations.updateOne(
                { _id: new ObjectId(chatRoomId) },
                { $set: { updatedAt: new Date() } },
            );
            return { success: true };
        }

        const chatRoom = await getChatRoom(chatRoomId);
        if (!chatRoom) {
            return { success: false, message: "Chat room not found" };
        }

        if (chatRoom.isDirect) {
            return { success: false, message: "Cannot leave a direct message" };
        }

        // Remove user from chat room in our database
        await removeChatRoomMember(userDid, chatRoomId);
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
        if (getChatProvider() === "mongo") {
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

            // Why this broke: Group Settings modal used legacy ChatRooms/provider-switched path,
            // so Mongo conversations had no matching ChatRooms doc -> "Chat room not found" and empty member list.
            const conversationUpdates: Record<string, any> = { updatedAt: new Date() };
            if (typeof updates.name === "string") {
                conversationUpdates.name = updates.name;
            }
            if (typeof updates.description === "string") {
                conversationUpdates.description = updates.description;
            }

            await ChatConversations.updateOne({ _id: new ObjectId(chatRoomId) }, { $set: conversationUpdates });
            return { success: true };
        }

        const chatRoom = await getChatRoom(chatRoomId);
        if (!chatRoom) {
            return { success: false, message: "Chat room not found" };
        }

        if (chatRoom.isDirect) {
            return { success: false, message: "Cannot update a direct message" };
        }

        const canEdit = await canUserEditGroupInfo(chatRoomId, userDid);
        if (!canEdit) {
            return { success: false, message: "You are not authorized to update group info" };
        }

        const conversationUpdates: Record<string, any> = {};
        if (typeof updates.name === "string") {
            conversationUpdates.name = updates.name;
        }
        if (typeof updates.description === "string") {
            conversationUpdates.description = updates.description;
        }
        conversationUpdates.updatedAt = new Date();

        // Keep ChatRooms in sync for legacy readers.
        await import("@/lib/data/chat").then(m => m.updateChatRoom({
            _id: chatRoomId,
            ...updates,
        }));

        // Mongo chat source-of-truth for list/detail display.
        if (!ObjectId.isValid(chatRoomId)) {
            return { success: false, message: "Invalid chat room ID" };
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
        if (getChatProvider() === "mongo") {
            const conversation = await getMongoConversation(chatRoomId);
            if (!conversation) {
                return { success: false, message: "Chat room not found" };
            }
            if (conversation.type === "dm") {
                return { success: true, isAdmin: false };
            }

            const canEdit = await canUserEditGroupInfo(chatRoomId, userDid);
            return { success: true, isAdmin: canEdit };
        }

        const chatRoom = await getChatRoom(chatRoomId);
        if (!chatRoom) {
            return { success: false, message: "Chat room not found" };
        }

        if (chatRoom.isDirect) {
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
        if (getChatProvider() === "mongo") {
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
        }

        const chatRoom = await getChatRoom(chatRoomId);
        if (!chatRoom) {
            return { success: false, message: "Chat room not found" };
        }

        if (chatRoom.isDirect) {
            return { success: false, message: "Cannot update avatar for direct messages" };
        }

        const { getChatRoomMembers } = await import("@/lib/data/chat");
        const members = await getChatRoomMembers(chatRoomId);
        if (!isRequesterAdmin(userDid, members as any[])) {
            return { success: false, message: "You are not authorized to update the group avatar" };
        }

        const { saveFile } = await import("@/lib/data/storage");
        const { getCircleByDid, getCircleById } = await import("@/lib/data/circle");
        const ownerCircle = chatRoom.circleId ? await getCircleById(chatRoom.circleId) : await getCircleByDid(userDid);
        if (!ownerCircle?._id) {
            return { success: false, message: "Could not resolve storage owner" };
        }

        const fileInfo = await saveFile(file, "chat-group-avatar", ownerCircle._id as string, true);

        // Update in our database
        await import("@/lib/data/chat").then(m => m.updateChatRoom({
            _id: chatRoomId,
            picture: { url: fileInfo.url }
        }));

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
        if (getChatProvider() === "mongo") {
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
        }

        const chatRoom = await getChatRoom(chatRoomId);
        if (!chatRoom) {
            return { success: false, message: "Chat room not found" };
        }

        const { getChatRoomMembers } = await import("@/lib/data/chat");
        const members = await getChatRoomMembers(chatRoomId);
        const activeMemberCount = (members as any[]).filter(isActiveChatRoomMembership).length;

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
        if (getChatProvider() === "mongo") {
            const conversation = await getMongoConversation(chatRoomId);
            if (!conversation) {
                return { success: false, message: "Chat room not found" };
            }
            if (conversation.type === "dm") {
                return { success: true, members: [] };
            }

            // Ensure requester can read group membership for this conversation.
            const access = await resolveMongoConversationAccessInternal(chatRoomId, userDid);
            if (!access.ok) {
                return { success: false, message: access.message };
            }

            let members = (await listMongoChatRoomMembers(chatRoomId)).filter(isActiveChatRoomMembership);

            // Auto-migration: If no admins exist, make the earliest active member an admin.
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
        }

        const chatRoom = await getChatRoom(chatRoomId);
        if (!chatRoom) {
            return { success: false, message: "Chat room not found" };
        }

        // Get all members
        const { getChatRoomMembers, updateChatRoomMemberRole } = await import("@/lib/data/chat");
        let members = await getChatRoomMembers(chatRoomId);

        // Auto-migration: If no admins exist, make the earliest member an admin
        const hasAdmin = members.some(m => m.role === "admin");
        if (!hasAdmin && members.length > 0) {
            // Find member with earliest joinedAt
            const earliestMember = members.reduce((prev, current) => 
                (new Date(prev.joinedAt) < new Date(current.joinedAt)) ? prev : current
            );
            
            // Update role in DB
            await updateChatRoomMemberRole(earliestMember.userDid, chatRoomId, "admin");
            
            // Update local members array to reflect change
            members = members.map(m => 
                m.userDid === earliestMember.userDid ? { ...m, role: "admin" } : m
            );
        }

        // Get user details for each member
        const membersWithDetails = await Promise.all(
            members.map(async (member) => {
                const user = await getUserByDid(member.userDid);
                return {
                    ...member,
                    _id: member._id?.toString(),
                    user: user ? {
                        did: user.did,
                        name: user.name,
                        handle: user.handle,
                        picture: user.picture,
                    } : null,
                };
            })
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
        if (getChatProvider() === "mongo") {
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

            return { success: true };
        }

        const { getChatRoomMembers, addChatRoomMember } = await import("@/lib/data/chat");
        
        // Check if requester is admin (or just a member if we allow members to add others)
        // Usually only admins add to private groups, but standard chat often allows any member.
        // Let's restrict to admins for consistency with other actions for now, unless we want open groups.
        const members = await getChatRoomMembers(chatRoomId);
        const requester = members.find(m => m.userDid === userDid);
        
        const isAdmin = requester?.role === "admin" || (requester && !requester.role); // Fallback for old groups
        
        if (!isAdmin) {
            return { success: false, message: "Only admins can add members" };
        }

        const chatRoom = await getChatRoom(chatRoomId);
        if (!chatRoom) {
            return { success: false, message: "Chat room not found" };
        }

        for (const newMemberDid of memberDids) {
            const isAlreadyMember = members.some(m => m.userDid === newMemberDid);
            if (!isAlreadyMember) {
                await addChatRoomMember(newMemberDid, chatRoomId);
            }
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
        if (getChatProvider() === "mongo") {
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

            await ChatRoomMembers.updateMany(
                { userDid: memberDid, ...buildMongoMembershipQuery(chatRoomId) },
                { $set: { status: "removed", active: false, isActive: false } as any },
            );
            await ChatConversations.updateOne(
                { _id: new ObjectId(chatRoomId) },
                { $set: { updatedAt: new Date() } },
            );
            return { success: true };
        }

        const { getChatRoomMembers, removeChatRoomMember } = await import("@/lib/data/chat");
        
        // Check if requester is admin
        const members = await getChatRoomMembers(chatRoomId);
        const requester = members.find(m => m.userDid === userDid);
        
        // Check permissions
        const isAdmin = requester?.role === "admin";
        if (!isAdmin) {
            return { success: false, message: "Only admins can remove members" };
        }

        // Cannot remove self using this action (use leave instead)
        if (memberDid === userDid) {
            return { success: false, message: "Use the leave option to remove yourself" };
        }

        // Remove from local DB
        await removeChatRoomMember(memberDid, chatRoomId);

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
        if (getChatProvider() === "mongo") {
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

            const result = await ChatRoomMembers.updateOne(
                { userDid: targetUserDid, ...buildMongoMembershipQuery(chatRoomId) },
                { $set: { role: "admin", status: "active", active: true, isActive: true } as any },
            );
            if (result.matchedCount === 0) {
                return { success: false, message: "Member not found" };
            }

            return { success: true };
        }

        const { getChatRoomMembers, updateChatRoomMemberRole } = await import("@/lib/data/chat");
        
        // Check if requester is admin
        const members = await getChatRoomMembers(chatRoomId);
        const requester = members.find(m => m.userDid === userDid);
        
        // Allow if requester is admin OR if it's an old group (fallback logic)
        // For security, we should strictly enforce admin role, but for now we'll match the UI logic
        const isAdmin = requester?.role === "admin" || (requester && !requester.role);
        
        if (!isAdmin) {
            return { success: false, message: "Only admins can promote members" };
        }

        await updateChatRoomMemberRole(targetUserDid, chatRoomId, "admin");
        return { success: true };
    } catch (error) {
        console.error("❌ Error promoting member:", error);
        return { success: false, message: error instanceof Error ? error.message : "Failed to promote member" };
    }
};
