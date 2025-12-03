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

export const sendMessageAction = async (
    roomId: string,
    content: string,
    replyToEventId?: string
): Promise<{ success: boolean; message?: string; eventId?: string }> => {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "You need to be logged in to send messages" };
    }

    try {
        console.log("📤 Sending message to room:", roomId);
        const user = await getPrivateUserByDid(userDid);
        if (!user?.matrixAccessToken) {
            console.error("❌ User does not have a valid Matrix access token");
            return { success: false, message: "User does not have a valid Matrix access token" };
        }

        // Import server-side Matrix function
        const { sendMatrixMessage, addUserToRoom } = await import("@/lib/data/matrix");
        
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
            // Check for "not in room" error and try to join
            if (innerError instanceof Error && 
                (innerError.message.includes("not in room") || innerError.message.includes("M_FORBIDDEN")) && 
                innerError.message.includes("403")) {
                
                console.log("⚠️ User not in room, attempting to join...");
                await addUserToRoom(user.matrixAccessToken, roomId);
                
                // Retry sending
                const result = await sendMatrixMessage(
                    user.matrixAccessToken,
                    roomId,
                    content,
                    replyToEventId
                );
                console.log("✅ Message sent successfully after join! Event ID:", result.event_id);
                return { success: true, eventId: result.event_id };
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

    try {
        const user = await getPrivateUserByDid(userDid);
        if (!user?.matrixAccessToken) {
            return { success: false, message: "User does not have a valid Matrix access token" };
        }

        // Import server-side Matrix function
        const { fetchRoomMessages } = await import("@/lib/data/matrix");
        
        const messages = await fetchRoomMessages(
            user.matrixAccessToken,
            roomId,
            limit
        );

        return { success: true, messages };
    } catch (error) {
        console.error("❌ Error fetching messages:", error);
        return { success: false, message: error instanceof Error ? error.message : "Failed to fetch messages" };
    }
};



export const sendAttachmentAction = async (
    formData: FormData
): Promise<{ success: boolean; message?: string; eventId?: string }> => {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "You need to be logged in to send attachments" };
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

        // Upload media
        const mxcUrl = await uploadMatrixMedia(
            user.matrixAccessToken,
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
