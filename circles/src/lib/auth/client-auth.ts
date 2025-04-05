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

/**
 * Check if a user is authorized to access a feature
 * @param user The user to check
 * @param circle The circle to check
 * @param feature The feature to check, can be a Feature object or a string in format "moduleHandle.featureHandle" or just "featureHandle" for general features
 * @returns True if the user is authorized, false otherwise
 */
export const isAuthorized = (user: UserPrivate | undefined, circle: Circle, feature: Feature): boolean => {
    let moduleHandle: string;
    let featureHandle: string;

    // It's a Feature object
    moduleHandle = feature.module;
    featureHandle = feature.handle;

    // Get the access rules for this circle
    const accessRules = circle.accessRules;
    if (!accessRules) return false;

    // Get the module rules
    const moduleRules = accessRules[moduleHandle];
    if (!moduleRules) {
        // Module not found in access rules, use default
        return getDefaultAllowedUserGroups(moduleHandle, featureHandle, user, circle);
    }

    // Get the feature rules
    const allowedUserGroups = moduleRules[featureHandle];
    if (!allowedUserGroups) {
        // Feature not found in module rules, use default
        return getDefaultAllowedUserGroups(moduleHandle, featureHandle, user, circle);
    }

    // Check if everyone is allowed
    if (allowedUserGroups.includes("everyone")) return true;

    // Check if the user is a member of the circle
    const membership = user?.memberships?.find((c) => c.circleId === circle._id);
    if (!membership) return false;

    // Check if the user is in any of the allowed user groups
    return allowedUserGroups.some((group) => membership.userGroups.includes(group));
};

/**
 * Get the default allowed user groups for a feature
 * @param moduleHandle The module handle
 * @param featureHandle The feature handle
 * @param user The user to check
 * @param circle The circle to check
 * @returns True if the user is authorized by default, false otherwise
 */
function getDefaultAllowedUserGroups(
    moduleHandle: string,
    featureHandle: string,
    user: UserPrivate | undefined,
    circle: Circle,
): boolean {
    // Try to get the feature from the features object
    const moduleFeatures = features[moduleHandle as keyof typeof features];
    if (moduleFeatures && typeof moduleFeatures === "object") {
        // Need to cast to any to avoid TypeScript errors with nested object access
        const featureObj = (moduleFeatures as any)[featureHandle];
        if (featureObj && featureObj.defaultUserGroups) {
            const defaultUserGroups = featureObj.defaultUserGroups as string[];

            // Check if everyone is allowed
            if (defaultUserGroups.includes("everyone")) return true;

            // Check if the user is a member of the circle
            const membership = user?.memberships?.find((c) => c.circleId === circle._id);
            if (!membership) return false;

            // Check if the user is in any of the allowed user groups
            return defaultUserGroups.some((group) => membership.userGroups.includes(group));
        }
    }

    // No default user groups found, deny access
    return false;
}

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

    // Default to empty array if no enabledModules or pages
    return [];
};
