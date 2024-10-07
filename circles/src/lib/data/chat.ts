import { ChatRooms, ChatMessages, Circles, Reactions } from "./db";
import { ObjectId } from "mongodb";
import { ChatRoom, ChatMessage, ChatMessageDisplay, Circle, Mention, SortingOptions } from "@/models/models";
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

// Chat Message Functions

export const createChatMessage = async (message: ChatMessage): Promise<ChatMessage> => {
    const result = await ChatMessages.insertOne(message);
    return { ...message, _id: result.insertedId.toString() };
};

export const getChatMessage = async (messageId: string): Promise<ChatMessage | null> => {
    let message = (await ChatMessages.findOne({ _id: new ObjectId(messageId) })) as ChatMessage;
    if (message) {
        message._id = message._id.toString();
    }
    return message;
};

export const getChatMessages = async (
    chatRoomId: string,
    userDid?: string,
    limit: number = 10,
    offset: number = 0,
    sort?: SortingOptions,
): Promise<ChatMessageDisplay[]> => {
    const safeLimit = Math.max(1, limit);
    const safeOffset = Math.max(0, offset);

    const messages = (await ChatMessages.aggregate([
        { $match: { chatRoomId: chatRoomId } },

        // Lookup for author details
        {
            $lookup: {
                from: "circles",
                localField: "createdBy",
                foreignField: "did",
                as: "authorDetails",
            },
        },
        { $unwind: "$authorDetails" },

        // Lookup for reactions on the message
        {
            $lookup: {
                from: "reactions",
                let: { messageId: { $toString: "$_id" } },
                pipeline: [
                    {
                        $match: {
                            $expr: { $and: [{ $eq: ["$contentId", "$$messageId"] }, { $eq: ["$userDid", userDid] }] },
                        },
                    },
                ],
                as: "userReaction",
            },
        },

        // Sorting and pagination
        { $sort: { createdAt: -1 } },
        { $skip: safeOffset },
        { $limit: safeLimit },

        // Final projection
        {
            $project: {
                _id: { $toString: "$_id" },
                chatRoomId: 1,
                content: 1,
                createdAt: 1,
                reactions: 1,
                media: 1,
                createdBy: 1,
                mentions: 1,
                userReaction: { $arrayElemAt: ["$userReaction.reactionType", 0] },
                author: {
                    did: "$authorDetails.did",
                    name: "$authorDetails.name",
                    picture: "$authorDetails.picture",
                    location: "$authorDetails.location",
                    description: "$authorDetails.description",
                    cover: "$authorDetails.cover",
                    handle: "$authorDetails.handle",
                },
            },
        },
    ]).toArray()) as ChatMessageDisplay[];

    return messages;
};

export const deleteChatMessage = async (messageId: string): Promise<void> => {
    await ChatMessages.deleteOne({ _id: new ObjectId(messageId) });

    // Optionally, delete associated reactions or replies
};

export const likeChatMessage = async (
    messageId: string,
    userDid: string,
    reactionType: string = "like",
): Promise<void> => {
    const existingReaction = await Reactions.findOne({
        contentId: messageId,
        contentType: "chatMessage",
        userDid,
        reactionType,
    });

    if (existingReaction) {
        return;
    }

    await Reactions.insertOne({
        contentId: messageId,
        contentType: "chatMessage",
        userDid,
        reactionType,
        createdAt: new Date(),
    });

    await ChatMessages.updateOne({ _id: new ObjectId(messageId) }, { $inc: { [`reactions.${reactionType}`]: 1 } });
};

export const unlikeChatMessage = async (
    messageId: string,
    userDid: string,
    reactionType: string = "like",
): Promise<void> => {
    await Reactions.deleteOne({
        contentId: messageId,
        contentType: "chatMessage",
        userDid,
        reactionType,
    });

    await ChatMessages.updateOne({ _id: new ObjectId(messageId) }, { $inc: { [`reactions.${reactionType}`]: -1 } });
};

export const getReactionsForMessage = async (messageId: string): Promise<Circle[]> => {
    const reactions = await Reactions.find({ contentId: messageId, contentType: "chatMessage" }).limit(20).toArray();
    const userDids = reactions.map((r) => r.userDid);
    const users = await Circles.find({ did: { $in: userDids } }).toArray();
    return users.map((user) => ({
        did: user.did,
        name: user.name,
        picture: user.picture,
        location: user.location,
        description: user.description,
        cover: user.cover,
        handle: user.handle,
    })) as Circle[];
};

export const checkIfLikedMessage = async (messageId: string, userDid: string): Promise<boolean> => {
    const reaction = await Reactions.findOne({
        contentId: messageId,
        contentType: "chatMessage",
        userDid,
        reactionType: "like",
    });
    return !!reaction;
};
