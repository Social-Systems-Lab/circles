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
