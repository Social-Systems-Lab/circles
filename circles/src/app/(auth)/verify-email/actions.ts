"use server";

import { Circles } from "@/lib/data/db";
import { hashToken } from "@/lib/data/email";
import { revalidatePath } from "next/cache";

interface VerifyEmailResponse {
    success: boolean;
    message: string;
}

export async function verifyEmailAction(token: string): Promise<VerifyEmailResponse> {
    if (!token) {
        return { success: false, message: "Verification token is missing." };
    }

    try {
        const hashedToken = hashToken(token);

        const user = await Circles.findOne({
            emailVerificationToken: hashedToken,
        });

        if (!user) {
            return { success: false, message: "Invalid or expired verification token." };
        }

        if (user.isEmailVerified) {
            return { success: true, message: "Email already verified. You can log in." };
        }

        if (user.emailVerificationTokenExpiry && new Date() > user.emailVerificationTokenExpiry) {
            // Optionally, you could offer to resend the verification email here
            // For now, just inform the user the token is expired.
            // Clear the expired token
            await Circles.updateOne(
                { _id: user._id },
                {
                    $set: {
                        emailVerificationToken: null,
                        emailVerificationTokenExpiry: null,
                    },
                },
            );
            return { success: false, message: "Verification token has expired. Please request a new one." };
        }

        // Token is valid and not expired, verify the email
        const updateResult = await Circles.updateOne(
            { _id: user._id },
            {
                $set: {
                    isEmailVerified: true,
                    emailVerificationToken: null,
                    emailVerificationTokenExpiry: null,
                },
            },
        );

        if (updateResult.modifiedCount === 0) {
            // This might happen if the user was updated between findOne and updateOne
            console.warn(
                `Failed to update email verification status for user ${user._id?.toString()}, but token was valid.`,
            );
            return { success: false, message: "Could not update email verification status. Please try again." };
        }

        // Revalidate user-specific paths if necessary, e.g., profile page
        if (user.handle) {
            revalidatePath(`/circles/${user.handle}`);
            revalidatePath(`/profile/${user.handle}`); // Assuming a profile page exists
        }

        return { success: true, message: "Email verified successfully! You can now log in." };
    } catch (error) {
        console.error("Error during email verification:", error);
        return { success: false, message: "An unexpected error occurred during email verification." };
    }
}
