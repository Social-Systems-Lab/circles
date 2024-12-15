"use server";

import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import { Circle, ChatRoomMember } from "@/models/models";
import { getUserByDid, getUsersByMatrixUsernames } from "@/lib/data/user";
import { chatFeaturePrefix } from "@/lib/data/constants";
import { addChatRoomMember, getChatRoom, getChatRoomMember, removeChatRoomMember } from "@/lib/data/chat";
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

        const circleId = chatRoom.circleId;
        const feature = chatFeaturePrefix + chatRoom.handle + "_view";
        const authorized = await isAuthorized(userDid, circleId, feature);
        if (!authorized) {
            return { success: false, message: "You are not authorized to join this chat room" };
        }

        // add user to matrix chat room
        let user = await getUserByDid(userDid);
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
