// used by tailwindcss to merge classnames, shadcn/ui CLI assumes the file is here

import { Circle, Content, Page } from "@/models/models";
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { pageFeaturePrefix } from "./data/constants";

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

type Identifiable = {
    handle: string;
    readOnly?: boolean;
};

export function safeModifyArray<T extends Identifiable>(existingArray: T[], submittedArray: T[]): T[] {
    if (!existingArray) {
        return submittedArray;
    }
    if (!submittedArray) {
        return existingArray;
    }

    const updatedArray: T[] = [];
    const handleSet = new Set<string>();

    // process submitted items
    for (const submittedItem of submittedArray) {
        handleSet.add(submittedItem.handle);
        updatedArray.push(submittedItem);
    }

    // ensure existing read-only items are in updatedArray
    for (const existingItem of existingArray) {
        if (existingItem.readOnly) {
            if (handleSet.has(existingItem.handle)) {
                var index = updatedArray.findIndex((x) => x.handle === existingItem.handle);
                if (index !== -1) {
                    updatedArray[index] = existingItem;
                } else {
                    updatedArray.unshift(existingItem);
                }
            } else {
                updatedArray.unshift(existingItem);
            }
        }
    }

    return updatedArray;
}

export function addPagesAccessRules(
    pages: Page[],
    existingAccessRules: Record<string, string[]>,
): Record<string, string[]> {
    // add rule for page if it doesn't exist
    for (const page of pages) {
        if (!existingAccessRules[pageFeaturePrefix + page.handle]) {
            existingAccessRules[pageFeaturePrefix + page.handle] = ["admins", "moderators", "members"]; // TODO add default access rules based on page type
        }
    }

    // remove rules for pages that don't exist
    for (const rule in existingAccessRules) {
        if (rule.startsWith(pageFeaturePrefix)) {
            const handle = rule.replace(pageFeaturePrefix, "");
            if (!pages.find((page) => page.handle === handle)) {
                delete existingAccessRules[rule];
            }
        }
    }

    return existingAccessRules;
}

export function safeModifyAccessRules(
    existingRules?: Record<string, string[]>,
    submittedRules?: Record<string, string[]>,
): Record<string, string[]> {
    // circle access rules can only be modified by users not added or removed
    if (!existingRules) {
        throw new Error("Existing rules must be provided");
    }
    if (!submittedRules) {
        return existingRules;
    }

    const updatedRules: Record<string, string[]> = {};
    const featureSet = new Set<string>();

    // add existing rules
    for (const feature in existingRules) {
        featureSet.add(feature);
        updatedRules[feature] = existingRules[feature];
    }

    // process submitted items
    for (const feature in existingRules) {
        if (!featureSet.has(feature)) {
            continue; // ignore features not in existing rules
        }
        updatedRules[feature] = submittedRules[feature];
    }

    // make sure admins have access to essential features
    if (!updatedRules["settings_edit"]?.includes("admins")) {
        throw new Error("Admins must have access to edit settings");
    }

    return updatedRules;
}

export function filterLocations(content: Content[]) {
    for (const item of content) {
        if (item.location) {
            switch (item.location.precision) {
                default:
                case 0: // country
                    item.location.region = undefined;
                    item.location.city = undefined;
                    item.location.street = undefined;
                    item.location.lngLat = undefined;
                    break;
                case 1: // region
                    item.location.city = undefined;
                    item.location.street = undefined;
                    item.location.lngLat = undefined;
                    break;
                case 2: // city
                    item.location.street = undefined;
                    item.location.lngLat = undefined;
                    break;
                case 3: // street
                    item.location.lngLat = undefined;
                    break;
                case 4: // exact
                    break;
            }
        }
    }

    return content;
}

export function safeModifyMemberUserGroups(
    existingUserGroups: string[],
    submittedUserGroups: string[],
    circle: Circle,
    accessLevel: number,
    canEditSameLevel: boolean,
): string[] {
    let circleUserGroups = circle.userGroups ?? [];

    const userGroupsMap = new Map(circleUserGroups.map((group) => [group.handle, group.accessLevel]));

    // create a set of user groups that the user has permission to modify
    const permissibleGroups = new Set(
        circleUserGroups
            .filter((group) => {
                if (canEditSameLevel) {
                    return userGroupsMap.get(group.handle) ?? 0 >= accessLevel;
                } else {
                    return userGroupsMap.get(group.handle) ?? 0 > accessLevel;
                }
            })
            .map((group) => group.handle),
    );

    // initialize the resulting user groups with the existing ones
    const resultingUserGroups = new Set(existingUserGroups);

    // add or remove user groups based on the submitted groups and permissible groups
    for (const group of submittedUserGroups) {
        if (permissibleGroups.has(group)) {
            resultingUserGroups.add(group);
        }
    }

    for (const group of existingUserGroups) {
        if (permissibleGroups.has(group) && !submittedUserGroups.includes(group)) {
            resultingUserGroups.delete(group);
        }
    }

    // convert the resulting user groups to an array
    const resultingUserGroupsArray = Array.from(resultingUserGroups);

    // sort the resulting user groups by access level
    resultingUserGroupsArray.sort((a, b) => (userGroupsMap.get(a) ?? 0) - (userGroupsMap.get(b) ?? 0));

    return resultingUserGroupsArray;
}
