/**
 * Account-lifecycle transactions shared across admin verification paths.
 *
 * Centralises the "activate a user" mutation so the Users-tab Verify action
 * and the Verification-Requests Approve action stay in lock-step: same
 * verified fields, same atomic accountStatus flip, same founding-member
 * auto-grant under window/cap.
 */

import { ObjectId } from "mongodb";
import { buildVerifiedUserSet } from "@/lib/auth/verification";
import { Circles } from "./db";
import { getNextFoundingMemberNumber, getPlatformSettings } from "./platform-settings";

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

    let foundingNumber: number | null = target.foundingMemberNumber ?? null;

    // Auto-grant founding member only on first activation. Skip on re-activation
    // of an already-active account so we never consume a number twice. Re-grant
    // of a previously-revoked founder (number still present, flag missing) is
    // handled by grantFoundingMember, not here.
    if (target.accountStatus !== "active") {
        const settings = await getPlatformSettings();
        if (settings.foundingMemberWindowOpen) {
            const cap = settings.foundingMemberCap ?? 1000;
            const activeCount = await Circles.countDocuments({
                isFoundingMember: true,
                circleType: "user",
            });
            if (activeCount < cap) {
                updateSet.isFoundingMember = true;
                updateSet.foundingMemberGrantedAt = new Date();
                if (!target.foundingMemberNumber) {
                    const assigned = await getNextFoundingMemberNumber();
                    updateSet.foundingMemberNumber = assigned;
                    foundingNumber = assigned;
                }
                // else: re-grant — restore flag, keep original number
            }
        }
    }

    await Circles.updateOne({ _id }, { $set: updateSet });

    return { foundingNumber };
}
