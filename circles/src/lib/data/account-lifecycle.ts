/**
 * Account-lifecycle transactions shared across admin verification paths.
 *
 * Centralises the "activate a user" mutation so the Users-tab Verify action
 * and the Verification-Requests Approve action stay in lock-step: same
 * verified fields and same atomic accountStatus flip.
 */

import { ObjectId } from "mongodb";
import { buildVerifiedUserSet } from "@/lib/auth/verification";
import { Circles } from "./db";

export async function activateUserAccount(
    userId: ObjectId | string,
    verifierDid: string,
): Promise<{ foundingNumber: number | null }> {
    const _id = typeof userId === "string" ? new ObjectId(userId) : userId;

    const target = await Circles.findOne(
        { _id, circleType: "user" },
        { projection: { accountStatus: 1, foundingMemberNumber: 1 } },
    );
    if (!target) {
        throw new Error("User not found");
    }

    const updateSet: Record<string, any> = {
        ...buildVerifiedUserSet(verifierDid),
        accountStatus: "active",
    };

    await Circles.updateOne({ _id }, { $set: updateSet });

    return { foundingNumber: target.foundingMemberNumber ?? null };
}
