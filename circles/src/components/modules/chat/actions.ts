"use server";

import {
    createChatMessage,
    likeChatMessage,
    unlikeChatMessage,
    getReactionsForMessage,
    checkIfLikedMessage,
    getChatRoom,
    getChatMessages,
    deleteChatMessage,
    getChatMessage,
    addChatRoomMember,
    getChatRoomMember,
    removeChatRoomMember,
} from "@/lib/data/chat";
import { saveFile, isFile } from "@/lib/data/storage";
import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import {
    Media,
    ChatMessage,
    chatMessageSchema,
    Circle,
    Page,
    ChatMessageDisplay,
    SortingOptions,
    ChatRoomMember,
} from "@/models/models";
import { revalidatePath } from "next/cache";
import { getCircleById, getCirclePath } from "@/lib/data/circle";
import { getUserByDid } from "@/lib/data/user";
import { redirect } from "next/navigation";
import { chatFeaturePrefix } from "@/lib/data/constants";

export async function testMatrixServerAction(): Promise<string> {
    // Test connection to Matrix server
    return "Matrix server response";
}

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

export async function getChatMessagesAction(
    chatRoomId: string,
    circleId: string,
    limit: number,
    skip: number,
    sortingOptions?: SortingOptions,
): Promise<ChatMessageDisplay[]> {
    let userDid = undefined;
    try {
        userDid = await getAuthenticatedUserDid();
    } catch (error) {}

    const chatRoom = await getChatRoom(chatRoomId);
    if (!chatRoom) {
        redirect("/not-found");
    }

    const feature = chatFeaturePrefix + chatRoom.handle + "_view";
    const authorized = await isAuthorized(userDid, circleId, feature);
    if (!authorized) {
        redirect("/not-authorized");
    }

    // Get chat messages for the chat room
    const chatMessages = await getChatMessages(chatRoomId, userDid, limit, skip, sortingOptions);
    return chatMessages;
}

export async function createChatMessageAction(
    formData: FormData,
    page?: Page,
    subpage?: string,
): Promise<{ success: boolean; message?: string; chatMessage?: ChatMessageDisplay }> {
    try {
        const content = formData.get("content") as string;
        const circleId = formData.get("circleId") as string;
        const chatRoomId = formData.get("chatRoomId") as string;

        const userDid = await getAuthenticatedUserDid();
        const chatRoom = await getChatRoom(chatRoomId);
        if (!chatRoom) {
            return { success: false, message: "Chat room not found" };
        }

        const feature = chatFeaturePrefix + chatRoom.handle + "_view";
        const authorized = await isAuthorized(userDid, circleId, feature);
        if (!authorized) {
            return { success: false, message: "You are not authorized to send messages in this chat room" };
        }

        // Check if the user has joined the chat room
        const chatRoomMember = await getChatRoomMember(userDid, chatRoom._id);
        if (!chatRoomMember) {
            return { success: false, message: "You need to join the chat room before sending messages" };
        }

        let chatMessage: ChatMessage = {
            content,
            chatRoomId,
            createdBy: userDid,
            createdAt: new Date(),
            reactions: {},
            repliesToMessageId: null,
        };

        await chatMessageSchema.parseAsync(chatMessage);

        let newChatMessage = await createChatMessage(chatMessage);

        // Handle media upload if any
        try {
            const savedMedia: Media[] = [];
            const images = formData.getAll("media") as File[];
            let imageIndex = 0;
            for (const image of images) {
                if (isFile(image)) {
                    const savedImage = await saveFile(
                        image,
                        `chatRooms/${chatRoom._id}/${newChatMessage._id}/message-image-${imageIndex}`,
                        circleId,
                        true,
                    );
                    savedMedia.push({ name: image.name, type: image.type, fileInfo: savedImage });
                }
                ++imageIndex;
            }

            if (savedMedia.length > 0) {
                newChatMessage.media = savedMedia;
            }
        } catch (error) {
            console.log("Failed to save message media", error);
        }

        let circlePath = await getCirclePath({ _id: circleId } as Circle);
        revalidatePath(`${circlePath}${page?.handle ?? ""}${subpage ? `/${subpage}` : ""}`);

        let chatMessageDisplay: ChatMessageDisplay = {
            ...newChatMessage,
            author: await getUserByDid(userDid),
        };

        return { success: true, message: "Message sent successfully", chatMessage: chatMessageDisplay };
    } catch (error) {
        return { success: false, message: error instanceof Error ? error.message : "Failed to send message." };
    }
}

export async function deleteChatMessageAction(
    messageId: string,
    page: Page,
    subpage?: string,
): Promise<{ success: boolean; message?: string }> {
    try {
        const userDid = await getAuthenticatedUserDid();
        const message = await getChatMessage(messageId);
        if (!message) {
            return { success: false, message: "Message not found" };
        }

        const chatRoom = await getChatRoom(message.chatRoomId);
        let canModerate = false;
        if (chatRoom) {
            const feature = chatFeaturePrefix + chatRoom.handle + "_moderate";
            canModerate = await isAuthorized(userDid, chatRoom.circleId, feature);
        }

        // Check if user can moderate chat room or is creator of the message
        if (message.createdBy !== userDid && !canModerate) {
            return { success: false, message: "You are not authorized to delete this message" };
        }

        // Delete message
        await deleteChatMessage(messageId);

        // Revalidate the page to reflect changes
        revalidatePath(`/${page.handle}${subpage ? `/${subpage}` : ""}`);

        return { success: true, message: "Message deleted successfully" };
    } catch (error) {
        console.error("Error deleting message:", error);
        return { success: false, message: "An error occurred while deleting the message" };
    }
}

export async function likeChatMessageAction(
    messageId: string,
    reactionType: string = "like",
): Promise<{ success: boolean; message?: string }> {
    try {
        const userDid = await getAuthenticatedUserDid();

        const message = await getChatMessage(messageId);
        if (!message) {
            return { success: false, message: "Message not found" };
        }

        const chatRoom = await getChatRoom(message.chatRoomId);
        if (chatRoom) {
            const feature = chatFeaturePrefix + chatRoom.handle + "_view";
            let canReact = await isAuthorized(userDid, chatRoom.circleId, feature);
            if (!canReact) {
                return { success: false, message: "You are not authorized to like messages in this chat room" };
            }
        }

        await likeChatMessage(messageId, userDid, reactionType);

        return { success: true, message: "Message liked successfully" };
    } catch (error) {
        return { success: false, message: error instanceof Error ? error.message : "Failed to like message." };
    }
}

export async function unlikeChatMessageAction(
    messageId: string,
    reactionType: string = "like",
): Promise<{ success: boolean; message?: string }> {
    try {
        const userDid = await getAuthenticatedUserDid();

        await unlikeChatMessage(messageId, userDid, reactionType);

        return { success: true, message: "Message unliked successfully" };
    } catch (error) {
        return { success: false, message: error instanceof Error ? error.message : "Failed to unlike message." };
    }
}

export async function getReactionsForChatMessageAction(
    messageId: string,
): Promise<{ success: boolean; reactions?: any[]; message?: string }> {
    try {
        const reactions = await getReactionsForMessage(messageId);

        return { success: true, reactions };
    } catch (error) {
        return { success: false, message: error instanceof Error ? error.message : "Failed to get reactions." };
    }
}

export async function checkIfLikedChatMessageAction(
    messageId: string,
): Promise<{ success: boolean; isLiked?: boolean; message?: string }> {
    try {
        const userDid = await getAuthenticatedUserDid();

        const isLiked = await checkIfLikedMessage(messageId, userDid);

        return { success: true, isLiked };
    } catch (error) {
        return { success: false, message: error instanceof Error ? error.message : "Failed to check if liked." };
    }
}
