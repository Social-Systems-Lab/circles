import { ChatRooms, ChatMessages, Circles, Reactions, ChatRoomMembers } from "./db";
import { ObjectId } from "mongodb";
import { ChatRoom, ChatMessage, Circle, Mention, SortingOptions, ChatRoomMember } from "@/models/models";
import { getCircleById, updateCircle } from "./circle";
import { addChatRoomsAccessRules } from "../utils";

// Chat Room Functions

export const createChatRoom = async (chatRoom: ChatRoom): Promise<ChatRoom> => {
    const result = await ChatRooms.insertOne(chatRoom);
    return { ...chatRoom, _id: result.insertedId.toString() };
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
    let defaultChatRoom = await getChatRoomByHandle(circleId, "default");
    if (!defaultChatRoom) {
        defaultChatRoom = {
            name: "General Chat",
            handle: "default",
            circleId,
            userGroups: ["admins", "moderators", "members", "everyone"],
            createdAt: new Date(),
        };
        defaultChatRoom = await createChatRoom(defaultChatRoom);
    }
    chatRooms.push(defaultChatRoom);

    let membersChat = await getChatRoomByHandle(circleId, "members");
    if (!membersChat) {
        membersChat = {
            name: circle.circleType === "user" ? "Friends Only" : "Members Only",
            handle: "members",
            circleId,
            userGroups: ["admins", "moderators", "members"],
            createdAt: new Date(),
        };
        membersChat = await createChatRoom(membersChat);
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
