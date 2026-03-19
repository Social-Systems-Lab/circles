"use server";

import { z } from "zod";
import { getAuthenticatedUserDid } from "@/lib/auth/auth";
import { Circles, db } from "@/lib/data/db";
import { Circle, UserPrivate, VerificationRequest } from "@/models/models";
import { ObjectId } from "mongodb";
import { sendEmail } from "@/lib/data/email";
import { getUserPrivate } from "@/lib/data/user";
import { sendVerificationRequestNotification } from "@/lib/data/notifications";
import { getVerificationStatus as getStatus } from "@/lib/data/user";
import {
    buildVerifiedUserSet,
    getRestrictedActionMessage,
    isVerifiedUser,
} from "@/lib/auth/verification";
import { isCommunityGuidelinesCompleted } from "@/lib/community-guidelines";

export async function getVerificationStatus() {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        throw new Error("User not authenticated.");
    }
    return await getStatus(userDid);
}

const requestVerificationSchema = z.object({});

type RequestVerificationState = {
    message: string;
    success?: boolean;
    emailSent?: boolean;
    requiresCommunityGuidelines?: boolean;
};

export async function requestVerification(
    prevState: RequestVerificationState,
    formData: FormData,
): Promise<RequestVerificationState> {
    try {
        const userDid = await getAuthenticatedUserDid();
        if (!userDid) {
            return { message: "User not authenticated." };
        }

        const user = await getUserPrivate(userDid);
        if (!user) {
            return { message: "User not found." };
        }
        if (isVerifiedUser(user)) {
            return { success: true, message: "Your account is already verified." };
        }
        if (!isCommunityGuidelinesCompleted(user.communityGuidelinesAcceptance)) {
            return {
                success: false,
                requiresCommunityGuidelines: true,
                message: "Please agree to Kamooni's core community rules before requesting verification.",
            };
        }

        const verificationCollection = db.collection<VerificationRequest>("verifications");

        const existingRequest = await verificationCollection.findOne({
            userDid: user.did,
            status: "pending",
        });

        if (existingRequest) {
            return { message: "You already have a pending verification request." };
        }

        const newRequest: VerificationRequest = {
            _id: new ObjectId(),
            userDid: user.did!,
            status: "pending",
            requestedAt: new Date(),
        };

        await verificationCollection.insertOne(newRequest);

        const admins = await db.collection<Circle>("circles").find({ isAdmin: true }).toArray();
        const adminUserPrivates = (await Promise.all(admins.map((admin) => getUserPrivate(admin.did!)))).filter(
            (up): up is UserPrivate => up !== null,
        );

        // Notify admins
        if (adminUserPrivates.length > 0) {
            await sendVerificationRequestNotification(user, adminUserPrivates);
        }

        let emailSent = false;
        const shouldSkipEmailInLocalDev = !process.env.POSTMARK_API_TOKEN && process.env.NODE_ENV === "development";

        if (shouldSkipEmailInLocalDev) {
            console.log("Skipping verification request email in development mode (POSTMARK_API_TOKEN not set).");
        } else {
            try {
                await sendEmail({
                    to: "hello@socialsystems.io",
                    templateAlias: "user-verification-request",
                    templateModel: {
                        subject: "New Account Verification Request",
                        header: "New Account Verification Request",
                        body: `User ${user.name} (@${user.handle}) has requested account verification.`,
                        action_url: "https://circles.socialsystems.io/admin?tab=users",
                    },
                });
                emailSent = true;
            } catch (emailError) {
                console.error("Failed to send verification request email. Request remains successful.", emailError);
            }
        }

        return {
            success: true,
            emailSent,
            message: "Verification request submitted successfully.",
        };
    } catch (error) {
        console.error("Error in requestVerification:", error);
        return { message: "An unexpected error occurred. Please try again later." };
    }
}

const verifyUserByInviteSchema = z.object({
    targetIdentifier: z.string().min(1, "Target user identifier is required."),
});

export async function verifyUserByInviteAction(
    targetIdentifier: string,
): Promise<{ success: boolean; message: string }> {
    try {
        const userDid = await getAuthenticatedUserDid();
        if (!userDid) {
            return { success: false, message: "User not authenticated." };
        }

        const verifier = await getUserPrivate(userDid);
        if (!verifier) {
            return { success: false, message: "Verifier not found." };
        }
        if (!isVerifiedUser(verifier)) {
            return { success: false, message: getRestrictedActionMessage("verify another user") };
        }

        const parsed = verifyUserByInviteSchema.safeParse({ targetIdentifier });
        if (!parsed.success) {
            return { success: false, message: parsed.error.errors[0]?.message || "Invalid target user." };
        }

        const normalizedIdentifier = parsed.data.targetIdentifier.trim();
        const targetUser =
            (ObjectId.isValid(normalizedIdentifier)
                ? await Circles.findOne({ _id: new ObjectId(normalizedIdentifier), circleType: "user" })
                : null) ||
            (await Circles.findOne({ did: normalizedIdentifier, circleType: "user" }));

        if (!targetUser) {
            return { success: false, message: "User not found." };
        }
        if (targetUser.did === verifier.did) {
            return { success: false, message: "You cannot verify your own account through invite verification." };
        }
        if (isVerifiedUser(targetUser)) {
            return { success: false, message: "User is already verified." };
        }

        await Circles.updateOne({ _id: targetUser._id }, { $set: buildVerifiedUserSet(verifier.did!) });

        return { success: true, message: "User verified successfully." };
    } catch (error) {
        console.error("Error in verifyUserByInviteAction:", error);
        return { success: false, message: "An unexpected error occurred. Please try again later." };
    }
}
