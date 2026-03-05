"use server";

import { z } from "zod";
import { getAuthenticatedUserDid } from "@/lib/auth/auth";
import { db } from "@/lib/data/db";
import { Circle, UserPrivate, VerificationRequest } from "@/models/models";
import { ObjectId } from "mongodb";
import { sendEmail } from "@/lib/data/email";
import { getUserPrivate } from "@/lib/data/user";
import { sendVerificationRequestNotification } from "@/lib/data/notifications";
import { getVerificationStatus as getStatus } from "@/lib/data/user";

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
