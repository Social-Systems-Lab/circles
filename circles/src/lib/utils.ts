// used by tailwindcss to merge classnames, shadcn/ui CLI assumes the file is here

import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

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

    // add existing read-only items and track handles
    for (const existingItem of existingArray) {
        if (existingItem.readOnly) {
            updatedArray.push(existingItem);
            handleSet.add(existingItem.handle);
        }
    }

    // process submitted items
    for (const submittedItem of submittedArray) {
        if (handleSet.has(submittedItem.handle)) {
            continue; // ignore readonly items
        }

        updatedArray.push(submittedItem);
    }
    return updatedArray;
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
