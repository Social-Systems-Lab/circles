// used by tailwindcss to merge classnames, shadcn/ui CLI assumes the file is here

import { ChatRoom, Circle, Content, Feed, Location } from "@/models/models";
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { getModuleFeatures, features } from "./data/constants";

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export function generateSlug(text: string): string {
    return text
        .toLowerCase()
        .replace(/[^\w\s-]/g, "") // Remove special characters
        .replace(/\s+/g, "-") // Replace spaces with hyphens
        .replace(/-+/g, "-") // Replace multiple hyphens with a single hyphen
        .trim(); // Trim leading/trailing spaces
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

    // process submitted items - include both existing and new features
    for (const feature in submittedRules) {
        updatedRules[feature] = submittedRules[feature];
    }

    // make sure admins have access to essential features
    if (!updatedRules["settings_edit"]?.includes("admins")) {
        throw new Error("Admins must have access to edit settings");
    }

    return updatedRules;
}

export function getFullLocationName(location?: Location): string {
    if (!location) {
        return "";
    }

    let name = "";
    // factor in precision in name as well
    if (location.precision >= 0) {
        if (location.country) {
            name += location.country;
        }
    }
    if (location.precision >= 1) {
        if (location.region) {
            name += ", " + location.region;
        }
    }
    if (location.precision >= 2) {
        if (location.city) {
            name += ", " + location.city;
        }
    }
    if (location.precision >= 3) {
        if (location.street) {
            name += ", " + location.street;
        }
    }
    return name;
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

export const timeSince = (date: Date, timeUntil: boolean, useShort = false) => {
    if (typeof date !== "object") {
        date = new Date(date);
    }

    let seconds = 0;
    if (timeUntil) {
        seconds = Math.floor((date.valueOf() - new Date().valueOf()) / 1000);
    } else {
        seconds = Math.floor((new Date().valueOf() - date.valueOf()) / 1000);
    }
    var intervalType;

    var interval = Math.floor(seconds / 31536000);
    if (interval >= 1) {
        intervalType = interval == 1 ? (useShort ? "y" : "year") : useShort ? "y" : "years";
    } else {
        interval = Math.floor(seconds / 2592000);
        if (interval >= 1) {
            intervalType = interval == 1 ? (useShort ? "mo" : "month") : useShort ? "mo" : "months";
        } else {
            interval = Math.floor(seconds / 86400);
            if (interval >= 1) {
                intervalType = interval == 1 ? (useShort ? "d" : "day") : useShort ? "d" : "days";
            } else {
                interval = Math.floor(seconds / 3600);
                if (interval >= 1) {
                    intervalType = interval == 1 ? (useShort ? "h" : "hour") : useShort ? "h" : "hours";
                } else {
                    interval = Math.floor(seconds / 60);
                    if (interval >= 1) {
                        intervalType = interval == 1 ? (useShort ? "m" : "minute") : useShort ? "m" : "minutes";
                    } else {
                        interval = seconds;
                        intervalType = interval == 1 ? (useShort ? "s" : "second") : useShort ? "s" : "seconds";
                    }
                }
            }
        }
    }
    if (useShort) return interval + intervalType;
    else return interval + " " + intervalType;
};

export const getDateLong = (date: Date) => {
    return date?.toLocaleDateString?.(undefined, { month: "long", day: "numeric" });
};

export const isToday = (date: Date) => {
    let currentDate = new Date().setHours(0, 0, 0, 0);
    let compareDate = new Date(date).setHours(0, 0, 0, 0);
    return currentDate === compareDate;
};

export const getPublishTime = (createdAt: Date) => {
    if (!createdAt) return "";

    if (isToday(createdAt)) {
        return timeSince(createdAt, false, true);
    } else {
        return getDateLong(createdAt);
    }
};
