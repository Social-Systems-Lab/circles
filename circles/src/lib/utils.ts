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

    // ensure read-only fields are not modified or removed
    const updatedArray = existingArray.map((existingItem) => {
        if (existingItem.readOnly) {
            // find the corresponding submitted item
            const submittedItem = submittedArray.find((item) => item.handle === existingItem.handle);
            if (submittedItem) {
                // return the existing read-only item to prevent modification
                return existingItem;
            } else {
                // if the read-only item is not in the submitted data, keep it
                return existingItem;
            }
        } else {
            // if the item is not read-only, allow it to be updated
            return submittedArray.find((item) => item.handle === existingItem.handle) || existingItem;
        }
    });

    // add new items that are not in the existing array
    const newItems = submittedArray.filter(
        (item) => !existingArray.find((existingItem) => existingItem.handle === item.handle),
    );

    // combine updated existing items and new items
    return [...updatedArray, ...newItems];
}
