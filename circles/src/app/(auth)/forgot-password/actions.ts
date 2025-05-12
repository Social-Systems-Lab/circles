"use server";

import { Circles } from "@/lib/data/db";
import { sendEmail, generateSecureToken, hashToken } from "@/lib/data/email";
import { z } from "zod";
import { emailSchema } from "@/models/models"; // Assuming emailSchema is in models

interface RequestPasswordResetResponse {
    success: boolean;
    message: string;
}

const requestResetSchema = z.object({
    email: emailSchema,
});

export async function requestPasswordResetAction(email: string): Promise<RequestPasswordResetResponse> {
    const validation = requestResetSchema.safeParse({ email });
    if (!validation.success) {
        return { success: false, message: "Invalid email address provided." };
    }

    try {
        const user = await Circles.findOne({ email: validation.data.email });

        // Important: Do not reveal if the user exists or not to prevent email enumeration.
        // Proceed as if sending an email, but only actually send if user exists and is verified.
        if (user && user.isEmailVerified) {
            const unhashedToken = generateSecureToken();
            const hashedToken = hashToken(unhashedToken);
            const expiry = new Date(Date.now() + 3600 * 1000); // 1 hour expiry

            await Circles.updateOne(
                { _id: user._id },
                {
                    $set: {
                        passwordResetToken: hashedToken,
                        passwordResetTokenExpiry: expiry,
                    },
                },
            );

            const resetLink = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/reset-password?token=${unhashedToken}`;

            try {
                await sendEmail({
                    to: user.email!, // user.email is guaranteed to exist if user is found by email
                    templateAlias: "password-reset", // As per spec
                    templateModel: {
                        name: user.name || "User",
                        resetLink: resetLink,
                        // Add any other variables your Postmark template might need
                    },
                });
                console.log(`Password reset email initiated for ${user.email}`);
            } catch (emailError) {
                console.error(`Failed to send password reset email to ${user.email}:`, emailError);
                // Do not expose this error to the client to prevent information leakage.
                // Log it for server-side debugging.
                // The generic success message will still be returned.
            }
        } else if (user && !user.isEmailVerified) {
            // User exists but email not verified. Still return generic success message.
            // Log this case for admin review if necessary.
            console.log(`Password reset requested for unverified email: ${validation.data.email}`);
        } else {
            // User does not exist. Still return generic success message.
            console.log(`Password reset requested for non-existent email: ${validation.data.email}`);
        }

        // Always return a generic success message to prevent email enumeration
        return {
            success: true,
            message: "If an account with that email exists and is verified, a password reset link has been sent.",
        };
    } catch (error) {
        console.error("Error during password reset request:", error);
        // Generic error for unexpected issues, but still avoid confirming/denying email existence.
        return { success: false, message: "An error occurred while processing your request. Please try again later." };
    }
}
