/**
 * Platform-wide operational settings and atomic counters.
 *
 * PRINCIPLE: signupOrderCounter, foundingMemberCounter, foundingMemberCap, and all
 * derived per-user fields (signupOrder, foundingMemberNumber, verifiedAt,
 * foundingMemberGrantedAt, verifiedBy) are admin-only operational metadata.
 * They must NEVER be surfaced in user-facing UI.
 */

import { PlatformSettings } from "@/models/models";
import { PlatformSettingsCollection } from "./db";

const SETTINGS_ID = "singleton";

export async function getPlatformSettings(): Promise<PlatformSettings> {
    const doc = await PlatformSettingsCollection.findOne({ _id: SETTINGS_ID as any });
    return {
        foundingMemberWindowOpen: true,
        foundingMemberCap: 1000,
        signupOrderCounter: 0,
        foundingMemberCounter: 0,
        ...doc,
        _id: doc?._id?.toString(),
    };
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

/** Returns the next founding member number atomically. Never decreases on revocation. */
export async function getNextFoundingMemberNumber(): Promise<number> {
    const result = await PlatformSettingsCollection.findOneAndUpdate(
        { _id: SETTINGS_ID as any },
        { $inc: { foundingMemberCounter: 1 } },
        { upsert: true, returnDocument: "after" },
    );
    return result?.foundingMemberCounter ?? 1;
}
