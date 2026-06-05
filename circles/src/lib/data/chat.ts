// chat.ts - chat logic

import { ChatConversations, ChatRooms, ChatRoomMembers, Circles, Members } from "./db";
import { ObjectId } from "mongodb";
import { ChatRoom, ChatRoomMember, ChatRoomDisplay, Circle } from "@/models/models";
import { getCircleById, updateCircle } from "./circle";
import { listConversationsForUser } from "./mongo-chat";

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
    const memberships = await Members.find({ userDid }).toArray();
    const circleIds = memberships.map((m) => m.circleId).filter(Boolean) as string[];

    // Only include:
    // - non-user circles (communities/projects/etc)
    // - OR your own user-circle (circle.did === userDid)
    const circleObjectIds = circleIds
        .map((id) => {
            try {
                return new ObjectId(id);
            } catch {
                return null;
            }
        })
        .filter(Boolean) as ObjectId[];

    const circles = await Circles.find(
        { _id: { $in: circleObjectIds } },
        { projection: { _id: 1, did: 1, circleType: 1 } },
    ).toArray();

    const allowedCircleIds = circles
        .filter((c: any) => c.circleType !== "user" || c.did === userDid)
        .map((c: any) => c._id.toString());

    return await listConversationsForUser(userDid, allowedCircleIds);
};

export const getChatContactsForUserDid = async (userDid: string): Promise<Circle[]> => {
    const contactDids = new Set<string>();
    const currentUser = await Circles.findOne(
        { did: userDid },
        { projection: { _id: 1 } },
    );
    const currentUserCircleId = currentUser?._id ? String(currentUser._id) : undefined;

    const outgoingMemberships = await Members.find({ userDid }, { projection: { circleId: 1 } }).toArray();
    const followedUserCircleIds = Array.from(
        new Set(
            outgoingMemberships
                .map((membership: any) => (typeof membership?.circleId === "string" ? membership.circleId : undefined))
                .filter((circleId): circleId is string => !!circleId && ObjectId.isValid(circleId)),
        ),
    );

    if (followedUserCircleIds.length > 0) {
        const followedObjectIds = followedUserCircleIds.map((circleId) => new ObjectId(circleId));
        const followedUsers = await Circles.find(
            {
                _id: { $in: followedObjectIds },
                circleType: "user",
                did: { $ne: userDid },
            },
            { projection: { did: 1 } },
        ).toArray();

        for (const followedUser of followedUsers) {
            if (followedUser?.did) {
                contactDids.add(String(followedUser.did));
            }
        }
    }

    if (currentUserCircleId) {
        const incomingMemberships = await Members.find(
            { circleId: currentUserCircleId, userDid: { $ne: userDid } },
            { projection: { userDid: 1 } },
        ).toArray();

        for (const follower of incomingMemberships) {
            if (follower?.userDid) {
                contactDids.add(String(follower.userDid));
            }
        }
    }

    const dmConversations = await ChatConversations.find(
        {
            type: "dm",
            participants: userDid,
            archived: { $ne: true },
        },
        { projection: { participants: 1 } },
    ).toArray();

    for (const conversation of dmConversations) {
        for (const participantDid of (conversation as any)?.participants || []) {
            if (participantDid && participantDid !== userDid) {
                contactDids.add(String(participantDid));
            }
        }
    }

    if (contactDids.size === 0) {
        return [];
    }

    return await Circles.find(
        {
            did: { $in: Array.from(contactDids) },
            circleType: "user",
        },
        {
            projection: {
                _id: 1,
                did: 1,
                handle: 1,
                name: 1,
                picture: 1,
                circleType: 1,
            },
        },
    )
        .sort({ name: 1 })
        .toArray();
};

export const searchMentionableUsersForUserDid = async (
    userDid: string,
    query: string,
    limit: number = 10,
): Promise<Circle[]> => {
    const contacts = await getChatContactsForUserDid(userDid);
    const normalizedQuery = query.trim().toLowerCase();

    const filtered = contacts.filter((contact) => {
        if (!normalizedQuery) return true;
        const nameMatch = contact.name?.toLowerCase().includes(normalizedQuery);
        const handleMatch = contact.handle?.toLowerCase().includes(normalizedQuery);
        return !!(nameMatch || handleMatch);
    });

    return filtered.slice(0, limit);
};

export const getMentionableUserIdsForUserDid = async (userDid: string): Promise<Set<string>> => {
    const contacts = await getChatContactsForUserDid(userDid);
    return new Set(
        contacts
            .map((contact) => (contact?._id ? String(contact._id) : undefined))
            .filter((contactId): contactId is string => !!contactId),
    );
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
        const memberStatus = typeof (existingMember as any).status === "string"
            ? (existingMember as any).status.toLowerCase()
            : undefined;
        const isInactiveMembership =
            memberStatus === "left" ||
            memberStatus === "inactive" ||
            (existingMember as any).active === false ||
    	    (existingMember as any).isActive === false;        

        if (isInactiveMembership) {
            await ChatRoomMembers.updateOne(
                { userDid: userDid, chatRoomId: chatRoomId },
                {
                    $set: {
                        status: "active",
                        active: true,
                        isActive: true,
                    } as any,
                },
            );
            const reactivatedMember = await ChatRoomMembers.findOne({ userDid: userDid, chatRoomId: chatRoomId });
            if (reactivatedMember) {
                return reactivatedMember;
            }
        }
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
    await ChatRoomMembers.updateOne(
        { userDid: userDid, chatRoomId: chatRoomId },
        {
            $set: {
                status: "left",
                active: false,
                isActive: false,
            } as any,
        },
    );
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
        await addChatRoomMember(userA.did!, existingRoom._id);
        await addChatRoomMember(userB.did!, existingRoom._id);

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

    return newRoom;
};

export const createGroupChatRoom = async (
    name: string,
    creatorDid: string,
    participantDids: string[],
    avatarUrl?: string
): Promise<ChatRoom> => {

    const newRoom: ChatRoom = {
        name: name,
        handle: `group-${Date.now()}`, // Generate a unique handle
        createdAt: new Date(),
        userGroups: [],
        isDirect: false,
        picture: avatarUrl ? { url: avatarUrl } : undefined,
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
