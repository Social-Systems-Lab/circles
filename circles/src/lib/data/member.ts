// member.ts - membership management
import crypto from "crypto";
import { Content, Member, MemberDisplay, SortingOptions } from "@/models/models";
import { ChatRoomMembers, ChatRooms, Circles, Members } from "./db";
import { ObjectId } from "mongodb";
import { filterLocations } from "../utils";
import { getMetrics } from "../utils/metrics";
import { SAFE_CIRCLE_PROJECTION } from "./circle";
import { addChatRoomMember, getChatRoomByHandle, removeChatRoomMember } from "./chat";
import { upsertFollowState } from "./relationships";
import { assertCircleWritesAllowed } from "./circle-lifecycle-policy";
export {
    getMemberDirectoryForViewer,
    getMemberDirectoryManagement,
    getPublicMemberDirectory,
} from "./member-directory-data";

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
    await assertCircleWritesAllowed(circleId);
    const circle = await Circles.findOne({ _id: new ObjectId(circleId) }, { projection: { did: 1, circleType: 1 } });
    if (!circle) {
        throw new Error("Circle not found");
    }

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

    if (circle.circleType === "user" && circle.did && circle.did !== userDid) {
        await upsertFollowState(userDid, circle.did, true);
    }

    return member;
};

/**
 * Idempotently completes the self-membership side effects required for a newly
 * provisioned personal profile. Unlike addMember, an existing row does not mean
 * that chat membership and the denormalized member count were also completed.
 */
export const ensureProvisionedPersonalMembership = async (userDid: string, circleId: string): Promise<void> => {
    await assertCircleWritesAllowed(circleId);
    const circleObjectId = new ObjectId(circleId);
    const circle = await Circles.findOne({ _id: circleObjectId }, { projection: { did: 1, circleType: 1 } });
    if (!circle || circle.circleType !== "user" || circle.did !== userDid) {
        throw new Error("Personal profile membership identity does not match");
    }

    const selfMembershipId = new ObjectId(
        crypto.createHash("sha256").update(`pending-self:${userDid}:${circleId}`).digest().subarray(0, 12),
    );
    try {
        await Members.updateOne(
            { userDid, circleId },
            {
                $setOnInsert: {
                    _id: selfMembershipId,
                    userDid,
                    circleId,
                    userGroups: ["admins", "moderators", "members"],
                    joinedAt: new Date(),
                },
            },
            { upsert: true },
        );
    } catch (error) {
        if ((error as { code?: number }).code !== 11000) throw error;
        const existing = await Members.findOne({ userDid, circleId }, { projection: { _id: 1 } });
        if (!existing) throw error;
    }

    const membersChat = await ChatRooms.findOne({ circleId, handle: "members" }, { projection: { _id: 1 } });
    if (membersChat?._id) {
        const chatRoomId = membersChat._id.toString();
        const chatMembershipId = new ObjectId(
            crypto.createHash("sha256").update(`pending-self-chat:${userDid}:${chatRoomId}`).digest().subarray(0, 12),
        );
        try {
            await ChatRoomMembers.updateOne(
                { userDid, chatRoomId },
                {
                    $setOnInsert: {
                        _id: chatMembershipId,
                        userDid,
                        chatRoomId,
                        circleId,
                        joinedAt: new Date(),
                        role: "member",
                    },
                    $set: { status: "active", active: true, isActive: true },
                },
                { upsert: true },
            );
        } catch (error) {
            if ((error as { code?: number }).code !== 11000) throw error;
            const existing = await ChatRoomMembers.findOne({ userDid, chatRoomId }, { projection: { _id: 1 } });
            if (!existing) throw error;
        }
    }

    // Recompute from the authoritative membership collection. This repairs the
    // crash window after the row insert without incrementing the count twice.
    const memberCount = await Members.countDocuments({ circleId });
    const countUpdate = await Circles.updateOne(
        { _id: circleObjectId, did: userDid },
        { $set: { members: memberCount } },
    );
    if (countUpdate.matchedCount !== 1) throw new Error("Personal profile disappeared during membership finalization");
};

export const removeMember = async (userDid: string, circleId: string): Promise<boolean> => {
    await assertCircleWritesAllowed(circleId);
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

    if (circle.circleType === "user" && circle.did && circle.did !== userDid) {
        await upsertFollowState(userDid, circle.did, false);
    }

    return true;
};

export const updateMemberUserGroups = async (
    userDid: string,
    circleId: string,
    newGroups: string[],
): Promise<Member> => {
    await assertCircleWritesAllowed(circleId);
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
    if (!membersChat?._id) return;

    // Add the user to the DB membership for that chat
    await addChatRoomMember(userDid, membersChat._id);
}

async function autoRemoveFromMemberChats(userDid: string, circleId: string) {
    const membersChat = await getChatRoomByHandle(circleId, "members");
    if (!membersChat?._id) return;

    // Remove from DB membership
    await removeChatRoomMember(userDid, membersChat._id);
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
