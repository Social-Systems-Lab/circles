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
import { chatFeaturePrefix } from "@/lib/data/constants";
import {
    addChatRoomMember,
    findOrCreateDMRoom,
    getChatRoom,
    getChatRoomMember,
    removeChatRoomMember,
} from "@/lib/data/chat";
import { addUserToRoom, sendReadReceipt } from "@/lib/data/matrix";

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
        const feature = chatFeaturePrefix + chatRoom.handle + "_view";
        const authorized = await isAuthorized(userDid, circleId, feature);
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

export const sendReadReceiptAction = async (roomId: string, eventId: string) => {
    await sendReadReceipt(roomId, eventId);
};

export const findOrCreateDMRoomAction = async (
    recipient: Circle,
): Promise<{ success: boolean; message?: string; chatRoom?: ChatRoom; user?: UserPrivate }> => {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "You need to be logged in to send PM" };
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
