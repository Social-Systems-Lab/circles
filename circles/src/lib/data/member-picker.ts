import "server-only";

import type { Feature } from "@/models/models";
import { isAuthorized } from "@/lib/auth/auth";
import { Circles, Members } from "@/lib/data/db";
import { ObjectId } from "mongodb";

export type MemberPickerDto = {
    userDid: string;
    name: string;
    picture?: { url: string };
};

export type MemberPickerResult =
    | { success: true; members: MemberPickerDto[] }
    | { success: false; message: "Member list unavailable"; members: [] };

export async function getAuthorizedMemberPickerResult({
    viewerDid,
    circleId,
    requiredFeature,
}: {
    viewerDid: string | undefined;
    circleId: string;
    requiredFeature: Feature;
}): Promise<MemberPickerResult> {
    if (!viewerDid) return { success: false, message: "Member list unavailable", members: [] };
    const members = await getAuthorizedMemberPicker({ viewerDid, circleId, requiredFeature });
    return members ? { success: true, members } : { success: false, message: "Member list unavailable", members: [] };
}

export async function getAuthorizedMemberPicker({
    viewerDid,
    circleId,
    requiredFeature,
}: {
    viewerDid: string;
    circleId: string;
    requiredFeature: Feature;
}): Promise<MemberPickerDto[] | null> {
    if (!ObjectId.isValid(circleId)) return null;

    const circle = await Circles.findOne(
        { _id: new ObjectId(circleId) },
        { projection: { _id: 1, circleType: 1, moderationStatus: 1 } },
    );
    if (!circle) return null;

    const membership = await Members.findOne({ userDid: viewerDid, circleId }, { projection: { _id: 1 } });
    if (!membership) return null;

    // isAuthorized applies both the feature access rule and the write lifecycle policy.
    if (!(await isAuthorized(viewerDid, circleId, requiredFeature))) return null;

    const members = await Members.aggregate<{
        userDid: string;
        name: string;
        picture?: { url?: string };
    }>([
        { $match: { circleId } },
        {
            $lookup: {
                from: "circles",
                localField: "userDid",
                foreignField: "did",
                pipeline: [{ $match: { circleType: "user" } }, { $project: { _id: 0, name: 1, "picture.url": 1 } }],
                as: "userDetails",
            },
        },
        { $unwind: "$userDetails" },
        { $project: { _id: 0, userDid: 1, name: "$userDetails.name", "picture.url": "$userDetails.picture.url" } },
    ]).toArray();

    return members.map((member) => ({
        userDid: member.userDid,
        name: member.name,
        ...(typeof member.picture?.url === "string" ? { picture: { url: member.picture.url } } : {}),
    }));
}
