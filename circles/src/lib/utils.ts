// used by tailwindcss to merge classnames, shadcn/ui CLI assumes the file is here

import { Page } from "@/models/models";
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
