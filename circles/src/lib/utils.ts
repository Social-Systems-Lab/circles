// used by tailwindcss to merge classnames, shadcn/ui CLI assumes the file is here

import { Circle, Content, Feed, Page } from "@/models/models";
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { feedFeaturePrefix, feedFeatures, pageFeaturePrefix } from "./data/constants";

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

export function addFeedsAccessRules(
    feeds: Feed[],
    existingAccessRules: Record<string, string[]>,
): Record<string, string[]> {
    // add rules for feed if it doesn't exist
    for (const feed of feeds) {
        for (const feedFeature of feedFeatures) {
            let feedFeatureHandle = feedFeaturePrefix + feed.handle + "_" + feedFeature.handle;
            if (!existingAccessRules[feedFeatureHandle]) {
                // handle special case for default feeds that have default user groups
                if (feed.handle === "default") {
                    switch (feedFeature.handle) {
                        case "view":
                            existingAccessRules[feedFeatureHandle] = ["admins", "moderators", "members", "everyone"];
                            break;
                        case "post":
                            existingAccessRules[feedFeatureHandle] = ["admins", "moderators"];
                            break;
                        case "comment":
                            existingAccessRules[feedFeatureHandle] = ["admins", "moderators", "members"];
                            break;
                        case "moderate":
                            existingAccessRules[feedFeatureHandle] = ["admins", "moderators"];
                            break;
                        default:
                            existingAccessRules[feedFeatureHandle] = feedFeature.defaultUserGroups ?? [
                                "admins",
                                "moderators",
                                "members",
                            ];
                            break;
                    }
                } else if (feed.handle === "members") {
                    switch (feedFeature.handle) {
                        case "view":
                            existingAccessRules[feedFeatureHandle] = ["admins", "moderators", "members"];
                            break;
                        case "post":
                            existingAccessRules[feedFeatureHandle] = ["admins", "moderators", "members"];
                            break;
                        case "comment":
                            existingAccessRules[feedFeatureHandle] = ["admins", "moderators", "members"];
                            break;
                        case "moderate":
                            existingAccessRules[feedFeatureHandle] = ["admins", "moderators"];
                            break;
                        default:
                            existingAccessRules[feedFeatureHandle] = feedFeature.defaultUserGroups ?? [
                                "admins",
                                "moderators",
                                "members",
                            ];
                            break;
                    }
                } else {
                    existingAccessRules[feedFeatureHandle] = feedFeature.defaultUserGroups ?? [
                        "admins",
                        "moderators",
                        "members",
                    ];
                }
            }
        }
    }

    console.log("new access rules:", existingAccessRules);

    // remove rules for feeds that don't exist
    for (const rule in existingAccessRules) {
        if (rule.startsWith(feedFeaturePrefix)) {
            let handle = rule.replace(feedFeaturePrefix, "");
            // remove feed feature postfix from handle
            handle = handle.substring(0, handle.lastIndexOf("_"));
            if (!feeds.find((feed) => feed.handle === handle)) {
                console.log("can't find feed with handle, deleting access rule", handle, rule);
                delete existingAccessRules[rule];
            }
        }
    }

    return existingAccessRules;
}

export function removeLast(str: string, pattern: string): string {
    const n = str.lastIndexOf(pattern);
    if (n >= 0 && n + pattern.length >= str.length) {
        return str.substring(0, n);
    }
    return str;
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
