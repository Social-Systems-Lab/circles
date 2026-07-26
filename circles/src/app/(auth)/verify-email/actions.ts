"use server";

import { Circles } from "@/lib/data/db";
import { hashToken } from "@/lib/data/email";
import { verifyEmailToken } from "@/lib/auth/email-verification-completion";
import type { ObjectId } from "mongodb";
import { revalidatePath } from "next/cache";

interface VerifyEmailResponse {
    success: boolean;
    message: string;
    handle?: string;
}

export async function verifyEmailAction(token: string): Promise<VerifyEmailResponse> {
    try {
        const response = await verifyEmailToken(token, {
            hashToken,
            findUserByHashedToken: async (hashedToken) => Circles.findOne({ emailVerificationToken: hashedToken }),
            clearToken: async (userId) => {
                await Circles.updateOne(
                    { _id: userId as ObjectId },
                    {
                        $set: {
                            emailVerificationToken: null,
                            emailVerificationTokenExpiry: null,
                        },
                    },
                );
            },
            markEmailVerified: async ({ userId, hashedToken, now }) => {
                const updateResult = await Circles.updateOne(
                    {
                        _id: userId as ObjectId,
                        isEmailVerified: { $ne: true },
                        emailVerificationToken: hashedToken,
                        emailVerificationTokenExpiry: { $gt: now },
                    },
                    {
                        $set: {
                            isEmailVerified: true,
                            emailVerificationToken: null,
                            emailVerificationTokenExpiry: null,
                        },
                    },
                );
                return updateResult.modifiedCount > 0;
            },
            warn: (message) => console.warn(message),
        });

        // Revalidate user-specific paths if necessary, e.g., profile page
        if (response.handle) {
            try {
                revalidatePath(`/circles/${response.handle}`);
                revalidatePath(`/circles/${response.handle}/settings/subscription`);
            } catch (revalidationError) {
                console.warn("Failed to revalidate user path after email verification:", revalidationError);
            }
        }

        return response;
    } catch (error) {
        console.error("Error during email verification:", error);
        return { success: false, message: "An unexpected error occurred during email verification." };
    }
}
