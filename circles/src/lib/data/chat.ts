// chat.ts - chat logic

import { ChatRooms, Circles, Members } from "./db";
import { ObjectId } from "mongodb";
import { ChatRoom, ChatRoomMember, ChatRoomDisplay, Circle } from "@/models/models";
import { getCircleById, updateCircle } from "./circle";
import { addUserToRoom, createMatrixRoom } from "./matrix";
import { getPrivateUserByDid } from "./user";
import { listConversationsForUser } from "./mongo-chat";

const getChatProvider = () => process.env.CHAT_PROVIDER || "matrix";

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

export const listChatRoomsForUser = async (userDid: string): Promise<ChatRoomDisplay[]> => {
    const provider = getChatProvider();
    if (provider === "mongo") {
      const memberships = await Members.find({ userDid }).toArray();
      const circleIds = memberships.map((m) => m.circleId).filter(Boolean);
      return await listConversationsForUser(userDid, circleIds);
    }

    const user = await getPrivateUserByDid(userDid);
    return user?.chatRoomMemberships?.map((membership) => membership.chatRoom) || [];
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

export const createDefaultChatRooms = async (circleId: string, userDid: string): Promise<ChatRoom[] | null> => {
    let circle = await getCircleById(circleId);
    if (!circle) {
        return null;
    }

    let chatRooms: ChatRoom[] = [];
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

    await updateCircle(circle, userDid);
    return existingChatRooms;
};

export const getChatRoomMember = async (userDid: string, chatRoomId: string): Promise<ChatRoomMember | null> => {
    return await ChatRoomMembers.findOne({ userDid: userDid, chatRoomId: chatRoomId });
};

export const addChatRoomMember = async (
    userDid: string,
    chatRoomId: string,
    role: "admin" | "member" = "member"
): Promise<ChatRoomMember> => {
    const existingMember = await ChatRoomMembers.findOne({ userDid: userDid, chatRoomId: chatRoomId });
    if (existingMember) {
        return existingMember;
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
        role,
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

export const updateChatRoomMemberRole = async (
    userDid: string, 
    chatRoomId: string, 
    role: "admin" | "member"
): Promise<void> => {
    await ChatRoomMembers.updateOne(
        { userDid, chatRoomId },
        { $set: { role } }
    );
};

export const findOrCreateDMRoom = async (userA: Circle, userB: Circle): Promise<ChatRoom> => {
    let dmParticipants = [userA._id as string, userB._id as string];

    // sort participant by ID
    dmParticipants.sort((a, b) => a.localeCompare(b));

    console.log("Searching for DM room between", dmParticipants);

    // Check if a DM already exists between these users
  const existingRoom = (await ChatRooms.findOne({
    isDirect: true,
    dmParticipants: { $all: dmParticipants },
    archived: { $ne: true },
})) as ChatRoom;



    console.log("Found existing room?", JSON.stringify(existingRoom));

    if (existingRoom) {
        existingRoom._id = existingRoom._id.toString();
 console.log("[DM RESOLVE]", {
    userA: userA?.did,
    userB: userB?.did,
    roomId: existingRoom?._id,
    archived: existingRoom?.archived
  });
        // If the room doesn't have a Matrix room, create one
        if (!existingRoom.matrixRoomId) {
            console.log("Creating Matrix room for existing DM");
            const matrixRoom = await createMatrixRoom(existingRoom._id, existingRoom.name, "Private Conversation");
            if (matrixRoom.roomId) {
                existingRoom.matrixRoomId = matrixRoom.roomId;
                await ChatRooms.updateOne(
                    { _id: new ObjectId(existingRoom._id) },
                    { $set: { matrixRoomId: matrixRoom.roomId } }
                );
            }
        }

        // add user to matrix chat room again to make sure in case process failed before
        if (existingRoom.matrixRoomId) {
            // add users to matrix room
            try {
                // get private user
                let privateA = await getPrivateUserByDid(userA.did!);
                let privateB = await getPrivateUserByDid(userB.did!);

                // add users as members to chat room
                await addChatRoomMember(userA.did!, existingRoom._id);
                await addChatRoomMember(userB.did!, existingRoom._id);

                await addUserToRoom(privateA.matrixAccessToken!, existingRoom.matrixRoomId);
                await addUserToRoom(privateB.matrixAccessToken!, existingRoom.matrixRoomId);
            } catch (error) {
                console.error("Error adding users to matrix room", error);
            }
        }

        return existingRoom;
    }

    // If no existing DM, create a new one
    let name = `dm-${dmParticipants[0]}-${dmParticipants[1]}`;
    const newRoom: ChatRoom = {
        name: name,
        handle: name,
        createdAt: new Date(),
        userGroups: [],
        isDirect: true,
        dmParticipants: dmParticipants,
    };

    // Insert into DB
    const result = await ChatRooms.insertOne(newRoom);
    newRoom._id = result.insertedId.toString();

    // add users as members to chat room
    await addChatRoomMember(userA.did!, newRoom._id);
    await addChatRoomMember(userB.did!, newRoom._id);

    // Create a corresponding Matrix room
    const matrixRoom = await createMatrixRoom(newRoom._id, newRoom.name, "Private Conversation");
    if (matrixRoom.roomId) {
        newRoom.matrixRoomId = matrixRoom.roomId;
        await ChatRooms.updateOne({ _id: result.insertedId }, { $set: { matrixRoomId: matrixRoom.roomId } });

        // add users to matrix room
        try {
            // get private user
            let privateA = await getPrivateUserByDid(userA.did!);
            let privateB = await getPrivateUserByDid(userB.did!);

            await addUserToRoom(privateA.matrixAccessToken!, newRoom.matrixRoomId);
            await addUserToRoom(privateB.matrixAccessToken!, newRoom.matrixRoomId);
        } catch (error) {
            console.error("Error adding users to matrix room", error);
        }
    }

    return newRoom;
};

export const createGroupChatRoom = async (
    name: string,
    creatorDid: string,
    participantDids: string[],
    matrixRoomId: string,
    avatarUrl?: string
): Promise<ChatRoom> => {
    // Convert Matrix mxc:// URL to HTTP URL if needed
    let httpAvatarUrl: string | undefined;
    if (avatarUrl) {
        if (avatarUrl.startsWith("mxc://")) {
            // Use localhost (nginx) to benefit from direct file serving
            const matrixUrl = "http://localhost";
            httpAvatarUrl = `${matrixUrl}/_matrix/media/v3/download/${avatarUrl.replace("mxc://", "")}`;
        } else {
            httpAvatarUrl = avatarUrl;
        }
    }

    const newRoom: ChatRoom = {
        name: name,
        handle: `group-${Date.now()}`, // Generate a unique handle
        createdAt: new Date(),
        userGroups: [],
        isDirect: false,
        matrixRoomId: matrixRoomId,
        picture: httpAvatarUrl ? { url: httpAvatarUrl } : undefined,
    };

    // Insert into DB
    const result = await ChatRooms.insertOne(newRoom);
    newRoom._id = result.insertedId.toString();

    // Add creator as admin
    await addChatRoomMember(creatorDid, newRoom._id, "admin");

    // Add other participants as members
    for (const did of participantDids) {
        if (did !== creatorDid) { // Skip creator since already added
            await addChatRoomMember(did, newRoom._id, "member");
        }
    }

    return newRoom;
};
