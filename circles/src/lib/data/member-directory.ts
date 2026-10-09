import type { Circle } from "@/models/models";
import { getCircleModerationStatus } from "./circle-lifecycle-policy";

export type PublicMemberDirectoryEntryDto = {
    name: string;
    handle?: string;
    picture?: {
        url: string;
    };
};

export type MemberDirectoryManagementEntryDto = PublicMemberDirectoryEntryDto & {
    userDid: string;
    userGroups: string[];
};

type PublicMemberDirectorySource = {
    name?: unknown;
    handle?: unknown;
    pictureUrl?: unknown;
};

type MemberDirectoryManagementSource = PublicMemberDirectorySource & {
    userDid?: unknown;
    userGroups?: unknown;
};

export const canExposePublicMemberDirectory = (circle?: Partial<Circle> | null): boolean =>
    Boolean(
        circle &&
            circle.publishStatus === "published" &&
            ["active", "paused"].includes(getCircleModerationStatus(circle)),
    );

export const buildPublicMemberDirectoryEntryDto = (
    source: PublicMemberDirectorySource,
): PublicMemberDirectoryEntryDto | null => {
    if (typeof source.name !== "string") return null;

    const entry: PublicMemberDirectoryEntryDto = { name: source.name };
    if (typeof source.handle === "string") entry.handle = source.handle;
    if (typeof source.pictureUrl === "string") entry.picture = { url: source.pictureUrl };
    return entry;
};

export const buildMemberDirectoryManagementEntryDto = (
    source: MemberDirectoryManagementSource,
): MemberDirectoryManagementEntryDto | null => {
    const publicEntry = buildPublicMemberDirectoryEntryDto(source);
    if (!publicEntry || typeof source.userDid !== "string") return null;

    return {
        ...publicEntry,
        userDid: source.userDid,
        userGroups: Array.isArray(source.userGroups)
            ? source.userGroups.filter((group): group is string => typeof group === "string")
            : [],
    };
};
