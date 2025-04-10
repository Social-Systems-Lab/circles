// member.ts - membership management
import { Content, Member, MemberDisplay, SortingOptions } from "@/models/models";
import { ChatRoomMembers, Circles, Members } from "./db";
import { ObjectId } from "mongodb";
import { filterLocations } from "../utils";
import { getMetrics } from "../utils/metrics";
import { SAFE_CIRCLE_PROJECTION } from "./circle";
import { addChatRoomMember, getChatRoomByHandle, removeChatRoomMember } from "./chat";
import { getPrivateUserByDid } from "./user";
import { addUserToRoom, removeUserFromRoom } from "./matrix";

export const getMember = async (userDid: string, circleId: string): Promise<Member | null> => {
    return await Members.findOne({ userDid: userDid, circleId: circleId });
};

export const getMembersWithMetrics = async (
    userDid: string | undefined,
    circleId?: string,
    sort?: SortingOptions,
): Promise<MemberDisplay[]> => {
    let members = await getMembers(circleId);

    const currentDate = new Date();
    let user = undefined;
    if (userDid) {
        user = (await Circles.findOne({ did: userDid }, { projection: SAFE_CIRCLE_PROJECTION })) ?? undefined;
    }

    // get metrics for each member
    for (const member of members) {
        member.metrics = await getMetrics(user, member, currentDate, sort);
    }

    // sort members by rank
    members.sort((a, b) => (a.metrics?.rank ?? 0) - (b.metrics?.rank ?? 0));
    return members;
};

export const getMembers = async (circleId?: string): Promise<MemberDisplay[]> => {
    if (!circleId) return [];

    let members = await Members.aggregate([
        { $match: { circleId: circleId } },
        {
            $lookup: {
                from: "circles",
                localField: "userDid",
                foreignField: "did",
                as: "userDetails",
            },
        },
        { $unwind: "$userDetails" },
        {
            $project: {
                _id: { $toString: "$_id" },
                userDid: 1,
                circleId: 1,
                userGroups: 1,
                joinedAt: 1,
                name: "$userDetails.name",
                picture: "$userDetails.picture",
                images: "$userDetails.images",
                location: "$userDetails.location",
                description: "$userDetails.description",
                members: "$userDetails.members",
                circleType: "$userDetails.circleType",
                handle: "$userDetails.handle",
                did: "$userDetails.did",
            },
        },
    ]).toArray();

    // filter location data based on precision
    //members = filterLocations(members as Content[]);
    return members as MemberDisplay[];
};

export const addMember = async (
    userDid: string,
    circleId: string,
    userGroups: string[],
    answers?: Record<string, string>,
): Promise<Member> => {
    const existingMember = await Members.findOne({ userDid: userDid, circleId: circleId });
    if (existingMember) {
        throw new Error("User is already a member of this circle");
    }

    // if circle has no members, add user as admin
    let memberCount = await Members.countDocuments({ circleId: circleId });
    if (memberCount === 0) {
        userGroups = ["admins", "moderators", "members"];
    }

    let member: Member = {
        userDid: userDid,
        circleId: circleId,
        userGroups: userGroups,
        joinedAt: new Date(),
        questionnaireAnswers: answers,
    };
    await Members.insertOne(member);

    // add member to chat
    await autoAddToMemberChats(userDid, circleId);

    // increase member count in circle
    await Circles.updateOne({ _id: new ObjectId(circleId) }, { $inc: { members: 1 } });

    return member;
};

export const removeMember = async (userDid: string, circleId: string): Promise<boolean> => {
    // ensure user can't be removed from their own circle
    const circle = await Circles.findOne({ _id: new ObjectId(circleId) });
    if (!circle) {
        throw new Error("Circle not found");
    }
    if (circle.did === userDid) {
        throw new Error("User can't leave their own circle");
    }

    let result = await Members.deleteOne({ userDid: userDid, circleId: circleId });
    if (result.deletedCount === 0) {
        throw new Error("User is not a member of this circle");
    }

    // decrease member count in circle
    await Circles.updateOne({ _id: new ObjectId(circleId) }, { $inc: { members: -1 } });

    // remove user from all chat rooms in the circle
    await ChatRoomMembers.deleteMany({ userDid: userDid, circleId: circleId });

    // remove member from members chat
    await autoRemoveFromMemberChats(userDid, circleId);

    return true;
};

export const updateMemberUserGroups = async (
    userDid: string,
    circleId: string,
    newGroups: string[],
): Promise<Member> => {
    let existingMember = await Members.findOne({ userDid: userDid, circleId: circleId });
    if (!existingMember) {
        throw new Error("Member not found");
    }

    let updatedMember: Member = {
        ...existingMember,
        userGroups: newGroups,
    };
    await Members.updateOne({ userDid: userDid, circleId: circleId }, { $set: updatedMember });
    return updatedMember;
};

export const countAdmins = async (circleId: string): Promise<number> => {
    return await Members.countDocuments({ circleId: circleId, userGroups: "admins" });
};

async function autoAddToMemberChats(userDid: string, circleId: string) {
    // Find the “members” chat in that circle
    const membersChat = await getChatRoomByHandle(circleId, "members");
    if (!membersChat?.matrixRoomId) return;

    // Add the user to the DB membership for that chat
    await addChatRoomMember(userDid, membersChat._id);

    // Add them to Matrix
    const user = await getPrivateUserByDid(userDid);
    if (!user?.matrixAccessToken) return;
    await addUserToRoom(user.matrixAccessToken, membersChat.matrixRoomId);
}

async function autoRemoveFromMemberChats(userDid: string, circleId: string) {
    const membersChat = await getChatRoomByHandle(circleId, "members");
    if (!membersChat?.matrixRoomId) return;

    // Remove from DB membership
    await removeChatRoomMember(userDid, membersChat._id);

    // Remove from Matrix
    const user = await getPrivateUserByDid(userDid);
    if (!user?.matrixUsername) return;
    await removeUserFromRoom(user.matrixUsername, membersChat.matrixRoomId);
}

/**
 * Get the user IDs (_id from circles collection) of members belonging to a specific user group within a circle.
 * @param circleId The ID of the circle
 * @param userGroupHandle The handle of the user group (e.g., "moderators")
 * @returns Array of user IDs (strings)
 */
export const getMemberIdsByUserGroup = async (circleId: string, userGroupHandle: string): Promise<string[]> => {
    try {
        const members = await Members.aggregate([
            // 1. Match members of the specific circle and user group
            {
                $match: {
                    circleId: circleId,
                    userGroups: userGroupHandle,
                },
            },
            // 2. Lookup the user's details from the 'circles' collection using userDid
            {
                $lookup: {
                    from: "circles",
                    localField: "userDid",
                    foreignField: "did",
                    pipeline: [
                        // Ensure we only get user documents
                        { $match: { circleType: "user" } },
                        // Project only the _id
                        { $project: { _id: 1 } },
                    ],
                    as: "userDetails",
                },
            },
            // 3. Unwind the userDetails array (should usually be one)
            { $unwind: { path: "$userDetails", preserveNullAndEmptyArrays: false } },
            // 4. Project just the user's _id as a string
            {
                $project: {
                    _id: 0, // Exclude the member _id
                    userId: { $toString: "$userDetails._id" },
                },
            },
        ]).toArray();

        // Extract the user IDs into a simple array
        return members.map((m) => m.userId);
    } catch (error) {
        console.error(`Error getting member IDs for group ${userGroupHandle} in circle ${circleId}:`, error);
        throw error; // Re-throw error to be handled by the caller
    }
};
