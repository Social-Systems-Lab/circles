import { Circle, Feature, MemberDisplay, UserPrivate } from "@/models/models";
import { features, maxAccessLevel } from "../data/constants";

export const getMemberAccessLevel = (user: UserPrivate | MemberDisplay | undefined, circle: Circle): number => {
    if (!user) return maxAccessLevel;

    let userGroups: string[] | undefined;
    if ("memberships" in user) {
        userGroups = user.memberships.find((c) => c.circleId === circle._id)?.userGroups;
    } else {
        userGroups = user.userGroups;
    }
    if (!userGroups || userGroups.length <= 0) return maxAccessLevel;

    return Math.min(
        ...userGroups?.map((x) => circle?.userGroups?.find((grp) => grp.handle === x)?.accessLevel ?? maxAccessLevel),
    );
};

// returns true if user has higher access than the member (lower access level = higher access)
export const hasHigherAccess = (
    user: UserPrivate | undefined,
    member: MemberDisplay | null,
    circle: Circle,
    acceptSameLevel: boolean,
): boolean => {
    if (!member) return false;

    const userAccessLevel = getMemberAccessLevel(user, circle);
    const memberAccessLevel = getMemberAccessLevel(member, circle);

    if (acceptSameLevel) {
        return userAccessLevel <= memberAccessLevel;
    } else {
        return userAccessLevel < memberAccessLevel;
    }
};

export const isAuthorized = (user: UserPrivate | undefined, circle: Circle, feature: Feature | string): boolean => {
    // lookup access rules in circle for the features
    let featureHandle = typeof feature === "string" ? feature : feature.handle;
    let allowedUserGroups = circle.accessRules?.[featureHandle];

    // If feature not found in access rules, get default user groups
    if (!allowedUserGroups) {
        const featureObj = typeof feature === "string" ? features[feature as keyof typeof features] : feature;
        allowedUserGroups = featureObj?.defaultUserGroups ?? [];
    }

    if (allowedUserGroups.includes("everyone")) return true;

    let membership = user?.memberships?.find((c) => c.circleId === circle._id);

    if (!membership) return false;
    return allowedUserGroups.some((group) => membership.userGroups.includes(group));
};
