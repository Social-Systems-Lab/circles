import { PlatformSettings } from "@/models/models";
import { PlatformSettingsCollection } from "./db";

const SETTINGS_ID = "singleton";

export async function getPlatformSettings(): Promise<PlatformSettings> {
    const doc = await PlatformSettingsCollection.findOne({ _id: SETTINGS_ID as any });
    if (!doc) {
        return { foundingMemberWindowOpen: false, foundingMemberCap: 100, signupOrderCounter: 0 };
    }
    return { ...doc, _id: doc._id?.toString() };
}

export async function updatePlatformSettings(patch: Partial<Omit<PlatformSettings, "_id">>): Promise<void> {
    await PlatformSettingsCollection.updateOne(
        { _id: SETTINGS_ID as any },
        { $set: patch },
        { upsert: true },
    );
}

/** Returns the next signup order number atomically. */
export async function getNextSignupOrder(): Promise<number> {
    const result = await PlatformSettingsCollection.findOneAndUpdate(
        { _id: SETTINGS_ID as any },
        { $inc: { signupOrderCounter: 1 } },
        { upsert: true, returnDocument: "after" },
    );
    return result?.signupOrderCounter ?? 1;
}
