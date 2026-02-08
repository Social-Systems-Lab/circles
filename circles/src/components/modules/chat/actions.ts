// chat/actions.ts - server actions for joining chat rooms
"use server";

import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import { Circle, ChatRoomMember, ChatRoom, ChatRoomDisplay, UserPrivate } from "@/models/models";
import {
    getAllUsers,
    getPrivateUserByDid,
    getUserByDid,
    getUserPrivate,
    getUsersByMatrixUsernames,
} from "@/lib/data/user";
import {
    addChatRoomMember,
    findOrCreateDMRoom,
    getChatRoom,
    getChatRoomMember,
    removeChatRoomMember,
} from "@/lib/data/chat";
import { addUserToRoom } from "@/lib/data/matrix";
import { features } from "@/lib/data/constants";
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
} from "./mongo-actions";

const parseEnvFlag = (value?: string | null) => {
    if (value === undefined || value === null) return true;
    const normalized = value.trim().toLowerCase();
    return normalized !== "false" && normalized !== "0" && normalized !== "off";
};

const isMatrixEnabled = () => parseEnvFlag(process.env.MATRIX_ENABLED);
const matrixDisabledMessage = "Matrix chat is disabled in this environment.";
const getChatProvider = () => process.env.CHAT_PROVIDER || "matrix";

export async function joinChatRoomAction(
    chatRoomId: string,
): Promise<{ success: boolean; message?: string; chatRoomMember?: ChatRoomMember }> {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "You need to be logged in to join a chat room" };
    }
    if (!isMatrixEnabled()) {
        return { success: false, message: matrixDisabledMessage };
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

        // add user to matrix chat room
        let user = await getPrivateUserByDid(userDid);
        if (!user?.matrixAccessToken) {
            return { success: false, message: "User does not have a valid Matrix access token" };
        }

        await addUserToRoom(user.matrixAccessToken, chatRoom.matrixRoomId!);
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

export const fetchMatrixUsers = async (usernames: string[]): Promise<(Circle | null)[]> => {
    if (usernames.length === 0) {
        return [];
    }

    // Extract local parts of the usernames
    const extractedUsernames = usernames
        .filter((username) => username)
        .map((username) => username.split(":")[0].replace("@", ""));

    // Fetch users from the database
    const users = await getUsersByMatrixUsernames(extractedUsernames);

    // Create a map of fetched users for quick lookup using extracted usernames
    const userMap = new Map(users.map((user) => [user.matrixUsername, user]));

    // Return users in the same order as requested, inserting null for missing users
    return extractedUsernames.map((extractedUsername) => {
        const user = userMap.get(extractedUsername);
        return user ?? null;
    });
};

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

export const sendMessageAction = async (
    roomId: string,
    content: string,
    replyToEventId?: string
): Promise<{ success: boolean; message?: string; eventId?: string }> => {
    const provider = getChatProvider();
    if (provider === "mongo") {
        const result = await sendMongoMessageActionInternal(roomId, content, replyToEventId);
        return { success: result.success, message: result.message, eventId: result.messageId };
    }

    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "You need to be logged in to send messages" };
    }
    if (!isMatrixEnabled()) {
        return { success: false, message: matrixDisabledMessage };
    }

    try {
        console.log("📤 Sending message to room:", roomId);
        const user = await getPrivateUserByDid(userDid);
        if (!user?.matrixAccessToken) {
            console.error("❌ User does not have a valid Matrix access token");
            return { success: false, message: "User does not have a valid Matrix access token" };
        }

        // Import server-side Matrix function
        const { sendMatrixMessage, forceUserJoinRoom } = await import("@/lib/data/matrix");  
        try {
               const result = await sendMatrixMessage(
                user.matrixAccessToken,
                roomId,
                content,
                replyToEventId
            );
            console.log("✅ Message sent successfully! Event ID:", result.event_id);
            return { success: true, eventId: result.event_id };
        } catch (innerError) {
            // Check for "not in room" error/M_FORBIDDEN and try to join
	    if (
    		innerError instanceof Error &&
    		(innerError.message.includes("M_FORBIDDEN") ||
        	  innerError.message.includes("not in room") ||
         	  innerError.message.includes("403"))
	    ) {
console.log("⚠️ User not in room, attempting to force join...", roomId);

const { MATRIX_DOMAIN } = await import("@/lib/data/matrix");

const mxid =
  user.fullMatrixName ||
  (user.matrixUsername ? `@${user.matrixUsername}:${MATRIX_DOMAIN}` : null);

if (!mxid) {
  throw new Error("User is missing Matrix identity (fullMatrixName/matrixUsername); cannot force join room");
}

await forceUserJoinRoom(mxid, roomId);

// Retry sending
const retryResult = await sendMatrixMessage(
  user.matrixAccessToken,
  roomId,
  content,
  replyToEventId
);

console.log("✅ Message sent successfully after force join! Event ID:", retryResult.event_id);
return { success: true, eventId: retryResult.event_id };
}
            throw innerError;
        }
    } catch (error) {
        console.error("❌ Error sending message:", error);
        return { success: false, message: error instanceof Error ? error.message : "Failed to send message" };
    }
};

export const fetchRoomMessagesAction = async (
    roomId: string,
    limit: number = 50
): Promise<{ success: boolean; messages?: any[]; message?: string }> => {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "You need to be logged in to fetch messages" };
    }
    const provider = getChatProvider();
    if (provider === "mongo") {
        const result = await fetchMongoMessagesActionInternal(roomId, limit);
        return { success: result.success, messages: result.messages, message: result.message };
    }
    if (!isMatrixEnabled()) {
        return { success: false, message: matrixDisabledMessage };
    }

    try {
        const user = await getPrivateUserByDid(userDid);
        if (!user?.matrixAccessToken) {
            return { success: false, message: "User does not have a valid Matrix access token" };
        }

        // Import server-side Matrix function
        const { fetchRoomMessages, forceUserJoinRoom } = await import("@/lib/data/matrix");
        
        try {
            const messages = await fetchRoomMessages(
                user.matrixAccessToken,
                roomId,
                limit
            );
            return { success: true, messages };
	} catch (innerError) {
             // Check for "not in room" error/M_FORBIDDEN and try to join
            if (
               innerError instanceof Error &&
               (innerError.message.includes("M_FORBIDDEN") ||
                   innerError.message.includes("not in room") ||
                   innerError.message.includes("403"))
           ) {
                
                console.log("⚠️ User not in room (fetch failed), attempting to force join...", roomId);
                if (user.fullMatrixName) {
                    await forceUserJoinRoom(user.fullMatrixName, roomId);
                    
                    // Retry fetching
                    const messages = await fetchRoomMessages(
                        user.matrixAccessToken,
                        roomId,
                        limit
                    );
                    console.log("✅ Messages fetched successfully after force join!");
                    return { success: true, messages };
                }
            }
            throw innerError;
        }
    } catch (error) {
        console.error("❌ Error fetching messages:", error);
        return { success: false, message: error instanceof Error ? error.message : "Failed to fetch messages" };
    }
};



export const sendAttachmentAction = async (
    formData: FormData
): Promise<{ success: boolean; message?: string; eventId?: string }> => {
    const provider = getChatProvider();
    if (provider === "mongo") {
        const result = await sendMongoAttachmentActionInternal(formData);
        return { success: result.success, message: result.message, eventId: result.messageId };
    }

    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "You need to be logged in to send attachments" };
    }
    if (!isMatrixEnabled()) {
        return { success: false, message: matrixDisabledMessage };
    }

    const roomId = formData.get("roomId") as string;
    const file = formData.get("file") as File;
    const replyToEventId = formData.get("replyToEventId") as string | undefined;

    if (!roomId || !file) {
        return { success: false, message: "Missing room ID or file" };
    }

    // Enforce 5MB limit
    const MAX_SIZE = 5 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
        return { success: false, message: "File size exceeds 5MB limit" };
    }

    try {
        const user = await getPrivateUserByDid(userDid);
        if (!user?.matrixAccessToken) {
            return { success: false, message: "User does not have a valid Matrix access token" };
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const { uploadMatrixMedia, sendMatrixAttachment, addUserToRoom } = await import("@/lib/data/matrix");

        const matrixUrl = user.matrixUrl || `http://${process.env.MATRIX_HOST || "127.0.0.1"}:${process.env.MATRIX_PORT || "8008"}`;

        // Upload media
        const mxcUrl = await uploadMatrixMedia(
            user.matrixAccessToken,
            matrixUrl,
            buffer,
            file.type,
            file.name
        );

        // Determine msgtype
        const msgtype = file.type.startsWith("image/") ? "m.image" : "m.file";

        try {
            // Send attachment message
            const result = await sendMatrixAttachment(
                user.matrixAccessToken,
                roomId,
                mxcUrl,
                { name: file.name, size: file.size, mimetype: file.type },
                msgtype,
                replyToEventId
            );

            console.log("✅ Attachment sent successfully! Event ID:", result.event_id);
            return { success: true, eventId: result.event_id };
        } catch (innerError) {
             // Check for "not in room" error and try to join
             if (innerError instanceof Error && 
                (innerError.message.includes("not in room") || innerError.message.includes("M_FORBIDDEN")) && 
                innerError.message.includes("403")) {
                
                console.log("⚠️ User not in room, attempting to join...");
                await addUserToRoom(user.matrixAccessToken, roomId);
                
                // Retry sending
                const result = await sendMatrixAttachment(
                    user.matrixAccessToken,
                    roomId,
                    mxcUrl,
                    { name: file.name, size: file.size, mimetype: file.type },
                    msgtype,
                    replyToEventId
                );
                console.log("✅ Attachment sent successfully after join! Event ID:", result.event_id);
                return { success: true, eventId: result.event_id };
            }
            throw innerError;
        }
    } catch (error) {
        console.error("❌ Error sending attachment:", error);
        return { success: false, message: error instanceof Error ? error.message : "Failed to send attachment" };
    }
};

export const editMessageAction = async (
    roomId: string,
    eventId: string,
    newContent: string
): Promise<{ success: boolean; message?: string }> => {
    const provider = getChatProvider();
    if (provider === "mongo") {
        return await editMongoMessageActionInternal(eventId, newContent);
    }

    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "You need to be logged in to edit messages" };
    }

    try {
        const user = await getPrivateUserByDid(userDid);
        if (!user?.matrixAccessToken) {
            return { success: false, message: "User does not have valid Matrix credentials" };
        }

        const { editRoomMessage } = await import("@/lib/data/matrix");
        const matrixUrl = `http://${process.env.MATRIX_HOST || "127.0.0.1"}:${process.env.MATRIX_PORT || "8008"}`;
        await editRoomMessage(
            user.matrixAccessToken,
            matrixUrl,
            roomId,
            eventId,
            newContent
        );

        return { success: true };
    } catch (error) {
        console.error("❌ Error editing message:", error);
        return { success: false, message: error instanceof Error ? error.message : "Failed to edit message" };
    }
};

export const deleteMessageAction = async (
    roomId: string,
    eventId: string
): Promise<{ success: boolean; message?: string }> => {
    const provider = getChatProvider();
    if (provider === "mongo") {
        return await deleteMongoMessageActionInternal(eventId);
    }

    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "You need to be logged in to delete messages" };
    }

    try {
        const user = await getPrivateUserByDid(userDid);
        if (!user?.matrixAccessToken) {
            return { success: false, message: "User does not have valid Matrix credentials" };
        }

        const { redactRoomMessage } = await import("@/lib/data/matrix");
        const matrixUrl = `http://${process.env.MATRIX_HOST || "127.0.0.1"}:${process.env.MATRIX_PORT || "8008"}`;
        await redactRoomMessage(
            user.matrixAccessToken,
            matrixUrl,
            roomId,
            eventId
        );

        return { success: true };
    } catch (error) {
        console.error("❌ Error deleting message:", error);
        return { success: false, message: error instanceof Error ? error.message : "Failed to delete message" };
    }
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
        const user = await getPrivateUserByDid(userDid);
        if (!user?.matrixAccessToken) {
            return { success: false, message: "User does not have valid Matrix credentials" };
        }

        const matrixUrl = user.matrixUrl || `http://${process.env.MATRIX_HOST || "127.0.0.1"}:${process.env.MATRIX_PORT || "8008"}`;

        const { createRoom, uploadMatrixMedia } = await import("@/lib/data/matrix");
        const { getPrivateUserByDid: getUser } = await import("@/lib/data/user");

        // Resolve participant DIDs to Matrix IDs
        const inviteList: string[] = [];
        for (const did of participantDids) {
            const participant = await getUser(did);
            if (participant?.fullMatrixName) {
                inviteList.push(participant.fullMatrixName);
            }
        }
        
        // Always invite the Admin user to ensure "God Mode" repairs work
        // (Administrator needs to be in private rooms to use Admin API)
        const { MATRIX_DOMAIN } = await import("@/lib/data/matrix");
        const adminMxId = `@admin:${MATRIX_DOMAIN}`;
        if (!inviteList.includes(adminMxId)) {
            inviteList.push(adminMxId);
        }

        let avatarUrl: string | undefined;
        if (avatarFile && avatarFile.size > 0) {
            const buffer = Buffer.from(await avatarFile.arrayBuffer());
            const uploadResult = await uploadMatrixMedia(
                user.matrixAccessToken,
                matrixUrl,
                buffer,
                avatarFile.type,
                avatarFile.name
            );
            avatarUrl = uploadResult;
        }

        const roomResult = await createRoom(user.matrixAccessToken, matrixUrl, {
            name,
            invite: inviteList,
            preset: "private_chat",
            creation_content: { "m.federate": true },
            initial_state: avatarUrl
                ? [
                      {
                          type: "m.room.avatar",
                          state_key: "",
                          content: { url: avatarUrl },
                      },
                  ]
                : undefined,
        });

        // Create the chat room in our local database
        const { createGroupChatRoom } = await import("@/lib/data/chat");
        await createGroupChatRoom(name, userDid, participantDids, roomResult.room_id, avatarUrl);

        return { success: true, roomId: roomResult.room_id };
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

    try {
        const user = await getPrivateUserByDid(userDid);
        if (!user?.matrixAccessToken) {
            return { success: false, message: "User does not have valid Matrix credentials" };
        }

        const { sendReadReceipt } = await import("@/lib/data/matrix");
        await sendReadReceipt(user.matrixAccessToken, roomId, eventId);

        return { success: true };
    } catch (error) {
        console.error("❌ Error sending read receipt:", error);
        return { success: false, message: error instanceof Error ? error.message : "Failed to send read receipt" };
    }
};

export const deleteGroupChatAction = async (
    chatRoomId: string
): Promise<{ success: boolean; message?: string }> => {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "You need to be logged in to delete a group" };
    }

    try {
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
        const chatRoom = await getChatRoom(chatRoomId);
        if (!chatRoom) {
            return { success: false, message: "Chat room not found" };
        }

        if (chatRoom.isDirect) {
            return { success: false, message: "Cannot leave a direct message" };
        }

        // Remove user from chat room in our database
        await removeChatRoomMember(userDid, chatRoomId);

        // Leave the Matrix room using user's own access token
        const user = await getPrivateUserByDid(userDid);
        if (user?.matrixAccessToken && chatRoom.matrixRoomId) {
            // Use Matrix API to leave room
            const matrixUrl = process.env.MATRIX_URL || `http://${process.env.MATRIX_HOST}:${process.env.MATRIX_PORT}`;
            const response = await fetch(
                `${matrixUrl}/_matrix/client/r0/rooms/${encodeURIComponent(chatRoom.matrixRoomId)}/leave`,
                {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${user.matrixAccessToken}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({}),
                }
            );

            if (!response.ok) {
                const error = await response.json();
                console.error("Failed to leave Matrix room:", error);
                // Don't fail the whole operation if Matrix leave fails
            }
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
        const chatRoom = await getChatRoom(chatRoomId);
        if (!chatRoom) {
            return { success: false, message: "Chat room not found" };
        }

        if (chatRoom.isDirect) {
            return { success: false, message: "Cannot update a direct message" };
        }

        // TODO: Check if user is admin
        // For now, we'll allow any member to update (should be restricted to admins)

        // Update in our database
        await import("@/lib/data/chat").then(m => m.updateChatRoom({
            _id: chatRoomId,
            ...updates,
        }));

        // Update in Matrix if name changed (non-blocking)
        if (updates.name && chatRoom.matrixRoomId) {
            try {
                const { updateMatrixRoomNameAndAvatar } = await import("@/lib/data/matrix");
                await updateMatrixRoomNameAndAvatar(chatRoom.matrixRoomId, updates.name);
            } catch (matrixError) {
                console.error("Failed to update Matrix room name:", matrixError);
                // Don't fail the whole operation if Matrix update fails
                // The database update succeeded, which is what matters
            }
        }

        return { success: true };
    } catch (error) {
        console.error("❌ Error updating group info:", error);
        return { success: false, message: error instanceof Error ? error.message : "Failed to update group info" };
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
        const chatRoom = await getChatRoom(chatRoomId);
        if (!chatRoom) {
            return { success: false, message: "Chat room not found" };
        }

        if (chatRoom.isDirect) {
            return { success: false, message: "Cannot update avatar for direct messages" };
        }

        const user = await getPrivateUserByDid(userDid);
        if (!user?.matrixAccessToken) {
            return { success: false, message: "User does not have a valid Matrix access token" };
        }

        const { uploadMatrixMedia, updateMatrixRoomNameAndAvatar } = await import("@/lib/data/matrix");
        const matrixUrl = user.matrixUrl || `http://${process.env.MATRIX_HOST || "127.0.0.1"}:${process.env.MATRIX_PORT || "8008"}`;
        
        const buffer = Buffer.from(await file.arrayBuffer());
        
        // Upload media to Matrix
        const mxcUrl = await uploadMatrixMedia(
            user.matrixAccessToken,
            matrixUrl,
            buffer,
            file.type,
            file.name
        );

        // Convert MXC URL to HTTP URL for local DB
        let httpAvatarUrl = mxcUrl;
        if (mxcUrl.startsWith("mxc://")) {
            // Use localhost (nginx) to benefit from direct file serving
            // In production this would be the public media repo URL
            httpAvatarUrl = `${matrixUrl}/_matrix/media/v3/download/${mxcUrl.replace("mxc://", "")}`;
        }

        // Update Matrix room avatar
        if (chatRoom.matrixRoomId) {
            try {
                await updateMatrixRoomNameAndAvatar(chatRoom.matrixRoomId, chatRoom.name, mxcUrl);
            } catch (matrixError) {
                console.error("Failed to update Matrix room avatar:", matrixError);
                // Continue to update local DB
            }
        }

        // Update in our database
        await import("@/lib/data/chat").then(m => m.updateChatRoom({
            _id: chatRoomId,
            picture: { url: httpAvatarUrl }
        }));

        return { success: true, pictureUrl: httpAvatarUrl };
    } catch (error) {
        console.error("❌ Error updating group avatar:", error);
        return { success: false, message: error instanceof Error ? error.message : "Failed to update group avatar" };
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

        const { getPrivateUserByDid } = await import("@/lib/data/user");
        const { inviteUserToRoom } = await import("@/lib/data/matrix");
        
        // Get requester's Matrix token for inviting
        const requesterUser = await getPrivateUserByDid(userDid);
        if (!requesterUser?.matrixAccessToken) {
            return { success: false, message: "You must be connected to Matrix to add members" };
        }

        for (const newMemberDid of memberDids) {
            // Check if already a member locally
            const isAlreadyMember = members.some(m => m.userDid === newMemberDid);
            
            if (!isAlreadyMember) {
                // Add to local DB
                await addChatRoomMember(newMemberDid, chatRoomId);
            }

            // Invite to Matrix (always try, in case they are locally added but not in Matrix)
            if (chatRoom.matrixRoomId) {
                try {
                    const newMemberUser = await getPrivateUserByDid(newMemberDid);
                    if (newMemberUser?.fullMatrixName) {
                        await inviteUserToRoom(
                            requesterUser.matrixAccessToken,
                            chatRoom.matrixRoomId,
                            newMemberUser.fullMatrixName
                        );
                    }
                } catch (matrixError) {
                    console.error(`Failed to invite ${newMemberDid} to Matrix room:`, matrixError);
                    // Don't fail the whole operation, just log
                }
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

        // Remove from Matrix
        const chatRoom = await getChatRoom(chatRoomId);
        if (chatRoom && chatRoom.matrixRoomId) {
            try {
                // We need the member's user ID to kick them from Matrix
                // Since we only have DID, we need to resolve it or just use the removeUserFromRoom helper 
                // which might expect a Matrix ID or handle the lookup.
                // Let's check removeUserFromRoom in matrix.ts. 
                // It expects userId (Matrix ID) but checks for "User not found" etc.
                // Actually removeUserFromRoom in matrix.ts takes (userId, roomId) where userId is matrix ID.
                // We need to find the user's matrix ID.
                
                const { getPrivateUserByDid } = await import("@/lib/data/user");
                const memberUser = await getPrivateUserByDid(memberDid);
                
                if (memberUser?.fullMatrixName) {
                    const { removeUserFromRoom } = await import("@/lib/data/matrix");
                    // removeUserFromRoom implementation in matrix.ts uses admin access token to kick
                    await removeUserFromRoom(memberUser.fullMatrixName, chatRoom.matrixRoomId);
                }
            } catch (matrixError) {
                console.error("Failed to remove user from Matrix room:", matrixError);
                // Don't fail the operation if Matrix kick fails (user might already be gone or other issue)
            }
        }

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
