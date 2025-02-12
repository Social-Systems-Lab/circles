// chat.ts - chat logic

import { ChatRooms, ChatMessages, Circles, Reactions, ChatRoomMembers } from "./db";
import { ObjectId } from "mongodb";
import {
    ChatRoom,
    ChatMessage,
    Circle,
    Mention,
    SortingOptions,
    ChatRoomMember,
    ChatRoomDisplay,
} from "@/models/models";
import { getCircleById, updateCircle } from "./circle";
import { addChatRoomsAccessRules } from "../utils";
import { createMatrixRoom } from "./matrix";

// Chat Room Functions

export const createChatRoom = async (chatRoom: ChatRoom): Promise<ChatRoom> => {
    const result = await ChatRooms.insertOne(chatRoom);
    return { ...chatRoom, _id: result.insertedId.toString() };
};

export const updateChatRoom = async (chatRoom: Partial<ChatRoom>): Promise<void> => {
    let { _id, ...chatRoomWithoutId } = chatRoom;
    let result = await ChatRooms.updateOne({ _id: new ObjectId(_id) }, { $set: chatRoomWithoutId });
    if (result.matchedCount === 0) {
        throw new Error("ChatRoom not found");
    }
};

export const getChatRoom = async (chatRoomId: string): Promise<ChatRoom | null> => {
    let chatRoom = (await ChatRooms.findOne({ _id: new ObjectId(chatRoomId) })) as ChatRoom;
    if (chatRoom) {
        chatRoom._id = chatRoom._id.toString();
    }
    return chatRoom;
};

export const getChatRooms = async (circleId: string): Promise<ChatRoom[]> => {
    let chatRooms = await ChatRooms.find({
        circleId,
    }).toArray();
    chatRooms.forEach((chatRoom: ChatRoom) => {
        if (chatRoom._id) {
            chatRoom._id = chatRoom._id.toString();
        }
    });
    return chatRooms;
};

export const getDefaultChatRoomByCircleHandle = async (circleHandle: string): Promise<ChatRoomDisplay | null> => {
    let circle = await Circles.findOne({ handle: circleHandle });
    if (!circle) {
        return null;
    }

    let chatRoom = await getChatRoomByHandle(circle._id.toString(), "members");
    if (!chatRoom) {
        return null;
    }

    let chatRoomDisplay: ChatRoomDisplay = {
        ...chatRoom,
        circle,
    };
    return chatRoomDisplay;
};

export const getChatRoomByHandle = async (
    circleId: string,
    chatRoomHandle: string | undefined,
): Promise<ChatRoom | null> => {
    // if handle is empty then return the default feed
    let chatRoom: ChatRoom;
    if (!chatRoomHandle) {
        chatRoom = (await ChatRooms.findOne({ circleId, handle: "default" })) as ChatRoom;
    } else {
        chatRoom = (await ChatRooms.findOne({ circleId, handle: chatRoomHandle })) as ChatRoom;
    }
    if (chatRoom?._id) {
        chatRoom._id = chatRoom._id.toString();
    }
    return chatRoom;
};

export const createDefaultChatRooms = async (circleId: string): Promise<ChatRoom[] | null> => {
    let circle = await getCircleById(circleId);
    if (!circle) {
        return null;
    }

    let chatRooms: ChatRoom[] = [];
    // let defaultChatRoom = await getChatRoomByHandle(circleId, "default");
    // if (!defaultChatRoom) {
    //     defaultChatRoom = {
    //         name: "General Chat",
    //         handle: "default",
    //         circleId,
    //         userGroups: ["admins", "moderators", "members", "everyone"],
    //         createdAt: new Date(),
    //     };
    //     defaultChatRoom = await createChatRoom(defaultChatRoom);
    // }

    // if (!defaultChatRoom.matrixRoomId) {
    //     // create matrix room
    //     let matrixRoom = await createMatrixRoom(defaultChatRoom._id, defaultChatRoom.name, defaultChatRoom.name);
    //     if (matrixRoom) {
    //         defaultChatRoom.matrixRoomId = matrixRoom.roomId;
    //         await updateChatRoom(defaultChatRoom);
    //     }
    // }

    // chatRooms.push(defaultChatRoom);

    let membersChat = await getChatRoomByHandle(circleId, "members");
    if (!membersChat) {
        membersChat = {
            name: circle.name!,
            handle: "members",
            circleId,
            userGroups: ["admins", "moderators", "members"],
            createdAt: new Date(),
            picture: circle.picture,
        };
        membersChat = await createChatRoom(membersChat);
    }

    if (!membersChat.matrixRoomId) {
        // create matrix room
        let matrixRoom = await createMatrixRoom(membersChat._id, membersChat.name, membersChat.name);
        if (matrixRoom) {
            membersChat.matrixRoomId = matrixRoom.roomId;
            await updateChatRoom(membersChat);
        }
    }

    chatRooms.push(membersChat);

    let existingChatRooms = await getChatRooms(circleId);

    circle.accessRules = addChatRoomsAccessRules(existingChatRooms, circle.accessRules ?? {});

    await updateCircle(circle);
    return existingChatRooms;
};

export const getChatRoomMember = async (userDid: string, chatRoomId: string): Promise<ChatRoomMember | null> => {
    return await ChatRoomMembers.findOne({ userDid: userDid, chatRoomId: chatRoomId });
};

export const addChatRoomMember = async (userDid: string, chatRoomId: string): Promise<ChatRoomMember> => {
    const existingMember = await ChatRoomMembers.findOne({ userDid: userDid, chatRoomId: chatRoomId });
    if (existingMember) {
        throw new Error("User is already a member of this chat room");
    }

    const chatRoom = await getChatRoom(chatRoomId);
    if (!chatRoom) {
        throw new Error("Chat room not found");
    }

    const member: ChatRoomMember = {
        userDid,
        chatRoomId,
        circleId: chatRoom.circleId,
        joinedAt: new Date(),
    };
    const result = await ChatRoomMembers.insertOne(member);
    return { ...member, _id: result.insertedId.toString() };
};

export const removeChatRoomMember = async (userDid: string, chatRoomId: string): Promise<void> => {
    await ChatRoomMembers.deleteOne({ userDid: userDid, chatRoomId: chatRoomId });
};

export const getChatRoomMembers = async (chatRoomId: string): Promise<ChatRoomMember[]> => {
    return await ChatRoomMembers.find({ chatRoomId: chatRoomId }).toArray();
};
