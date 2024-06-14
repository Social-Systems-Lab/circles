import { Member } from "@/models/models";
import { Members } from "./db";

export const getMembers = async (circleId: string): Promise<Member[]> => {
    return Members.find({ circleId: circleId }).toArray();
};

export const addMember = async (userDid: string, circleId: string, userGroups: string[]): Promise<Member> => {
    let member: Member = {
        userDid: userDid,
        circleId: circleId,
        userGroups: userGroups,
        joinedAt: new Date(),
    };
    await Members.insertOne(member);
    return member;
};
