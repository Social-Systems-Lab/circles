import { ObjectId } from "mongodb";
import type { Circle } from "@/models/models";
import { Circles, Members } from "./db";
import {
    buildMemberDirectoryManagementEntryDto,
    buildPublicMemberDirectoryEntryDto,
    canExposePublicMemberDirectory,
    type MemberDirectoryManagementEntryDto,
    type PublicMemberDirectoryEntryDto,
} from "./member-directory";

const PUBLIC_DIRECTORY_CIRCLE_PROJECTION = {
    _id: 1,
    did: 1,
    circleType: 1,
    publishStatus: 1,
    moderationStatus: 1,
} as const;

const getDirectoryCircle = async (circleId: string): Promise<Circle | null> => {
    if (!ObjectId.isValid(circleId)) return null;
    const circle = await Circles.findOne(
        { _id: new ObjectId(circleId) },
        { projection: PUBLIC_DIRECTORY_CIRCLE_PROJECTION },
    );
    return circle as Circle | null;
};

const getMemberDirectorySources = async (circle: Circle, includeManagementFields: boolean) => {
    const projection: Record<string, unknown> = {
        _id: 0,
        name: "$userDetails.name",
        handle: "$userDetails.handle",
        pictureUrl: "$userDetails.picture.url",
    };
    if (includeManagementFields) {
        projection.userDid = 1;
        projection.userGroups = 1;
    }
    return Members.aggregate([
        { $match: { circleId: circle._id!.toString() } },
        {
            $lookup: {
                from: "circles",
                localField: "userDid",
                foreignField: "did",
                pipeline: [
                    { $match: { circleType: "user" } },
                    { $project: { _id: 0, name: 1, handle: 1, "picture.url": 1 } },
                ],
                as: "userDetails",
            },
        },
        { $unwind: "$userDetails" },
        ...(circle.circleType === "user" && circle.did ? [{ $match: { userDid: { $ne: circle.did } } }] : []),
        { $project: projection },
    ]).toArray();
};

export const getPublicMemberDirectory = async (circleId: string): Promise<PublicMemberDirectoryEntryDto[]> => {
    const circle = await getDirectoryCircle(circleId);
    if (!circle || !canExposePublicMemberDirectory(circle)) return [];
    return (await getMemberDirectorySources(circle, false)).flatMap((source) => {
        const entry = buildPublicMemberDirectoryEntryDto(source);
        return entry ? [entry] : [];
    });
};

export const getMemberDirectoryManagement = async (circleId: string): Promise<MemberDirectoryManagementEntryDto[]> => {
    const circle = await getDirectoryCircle(circleId);
    if (!circle) return [];
    return (await getMemberDirectorySources(circle, true)).flatMap((source) => {
        const entry = buildMemberDirectoryManagementEntryDto(source);
        return entry ? [entry] : [];
    });
};

export const getMemberDirectoryForViewer = async (
    circleId: string,
    circle: Circle,
    userDid: string | undefined,
    managementAuthorized: boolean,
): Promise<
    | { canManageMembers: false; members: PublicMemberDirectoryEntryDto[] }
    | { canManageMembers: true; members: MemberDirectoryManagementEntryDto[] }
    | null
> => {
    const canManageMembers = Boolean(userDid) && managementAuthorized;
    if (canManageMembers) {
        return { canManageMembers: true, members: await getMemberDirectoryManagement(circleId) };
    }
    if (!canExposePublicMemberDirectory(circle)) return null;
    return { canManageMembers: false, members: await getPublicMemberDirectory(circleId) };
};
