import { Member, MemberDisplay } from "@/models/models";
import { Members } from "./db";

export const getMembers = async (circleId?: string): Promise<MemberDisplay[]> => {
    if (!circleId) return [];

    let members = await Members.aggregate([
        { $match: { circleId: circleId } },
        {
            $lookup: {
                from: "users",
                localField: "userDid",
                foreignField: "did",
                as: "userDetails",
            },
        },
        { $unwind: "$userDetails" },
        {
            $project: {
                userDid: 1,
                circleId: 1,
                userGroups: 1,
                joinedAt: 1,
                name: "$userDetails.name",
                profilePicture: "$userDetails.profilePicture",
            },
        },
    ]).toArray();

    return members as MemberDisplay[];
};

export const addMember = async (userDid: string, circleId: string, userGroups: string[]): Promise<Member> => {
    const existingMember = await Members.findOne({ userDid: userDid, circleId: circleId });
    if (existingMember) {
        throw new Error("User is already a member of this circle");
    }

    let member: Member = {
        userDid: userDid,
        circleId: circleId,
        userGroups: userGroups,
        joinedAt: new Date(),
    };
    await Members.insertOne(member);
    return member;
};
