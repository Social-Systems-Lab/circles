import { Circle, Feature, MemberDisplay, UserPrivate } from "@/models/models";
import { features, maxAccessLevel } from "../data/constants";
import { modules } from "@/components/modules/modules";

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

/**
 * Check if a module is enabled for a circle
 * @param circle The circle to check
 * @param moduleHandle The module handle to check
 * @returns True if the module is enabled, false otherwise
 */
export const isModuleEnabled = (circle: Circle, moduleHandle: string): boolean => {
    // First check enabledModules array if it exists
    if (circle.enabledModules && circle.enabledModules.length > 0) {
        return circle.enabledModules.includes(moduleHandle);
    }

    // For backward compatibility, check pages
    if (circle.pages && circle.pages.length > 0) {
        // Map module handle to page module
        const pageModule = moduleHandle === "feed" ? "feeds" : moduleHandle === "followers" ? "members" : moduleHandle;

        // Check if any page with this module is enabled
        return circle.pages.some((page) => page.module === pageModule && page.enabled !== false);
    }

    // Default to false if no enabledModules or pages
    return false;
};

/**
 * Get all enabled modules for a circle
 * @param circle The circle to check
 * @returns Array of enabled module handles
 */
export const getEnabledModules = (circle: Circle): string[] => {
    // First check enabledModules array if it exists
    if (circle.enabledModules && circle.enabledModules.length > 0) {
        return circle.enabledModules;
    }

    // For backward compatibility, check pages
    if (circle.pages && circle.pages.length > 0) {
        // Get all enabled pages
        const enabledPages = circle.pages.filter((page) => page.enabled !== false);

        // Map page modules to module handles
        return enabledPages.map((page) => {
            if (page.module === "feeds") return "feed";
            if (page.module === "members") return "followers";
            return page.module;
        });
    }

    // Default to empty array if no enabledModules or pages
    return [];
};
