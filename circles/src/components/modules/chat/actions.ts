"use server";

import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import { Circle, ChatRoomMember } from "@/models/models";
import { getUsersByMatrixUsernames } from "@/lib/data/user";
import { chatFeaturePrefix } from "@/lib/data/constants";
import { addChatRoomMember, getChatRoom, getChatRoomMember, removeChatRoomMember } from "@/lib/data/chat";

export async function joinChatRoomAction(
    chatRoomId: string,
): Promise<{ success: boolean; message?: string; chatRoomMember?: ChatRoomMember }> {
    try {
        const userDid = await getAuthenticatedUserDid();

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

        const chatRoomMember = await addChatRoomMember(userDid, chatRoomId);

        return { success: true, message: "Joined chat room successfully", chatRoomMember };
    } catch (error) {
        console.error("Error in joinChatRoomAction:", error);
        return { success: false, message: error instanceof Error ? error.message : "Failed to join chat room." };
    }
}

export async function leaveChatRoomAction(chatRoomId: string): Promise<{ success: boolean; message?: string }> {
    try {
        const userDid = await getAuthenticatedUserDid();

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
    const extractedUsernames = usernames.map((username) => username.split(":")[0].replace("@", ""));

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
