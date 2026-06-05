"use server";

import { Circles } from "@/lib/data/db";
import { sendEmail, generateSecureToken, hashToken } from "@/lib/data/email";
import { headers } from "next/headers";
import { z } from "zod";
import { emailSchema } from "@/models/models"; // Assuming emailSchema is in models

interface RequestPasswordResetResponse {
    success: boolean;
    message: string;
}

const requestResetSchema = z.object({
    email: emailSchema,
});

function normalizeBaseUrl(url: string): string {
    return url.replace(/\/+$/, "");
}

function isLocalHost(hostname: string): boolean {
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

async function resolveResetBaseUrl(): Promise<string> {
    const explicitBaseUrl =
        process.env.NEXT_PUBLIC_APP_URL ||
        process.env.APP_URL ||
        process.env.SITE_URL ||
        (process.env.NODE_ENV === "production" ? process.env.CIRCLES_URL : undefined);

    let requestOrigin: string | undefined;
    try {
        const h = await headers();
        const originHeader = h.get("origin");
        if (originHeader) {
            requestOrigin = new URL(originHeader).origin;
        } else {
            const host = h.get("x-forwarded-host") || h.get("host");
            const proto = h.get("x-forwarded-proto") || (process.env.NODE_ENV === "production" ? "https" : "http");
            if (host) {
                requestOrigin = `${proto}://${host}`;
            }
        }
    } catch {
        // No request scope (e.g., direct script invocation)
    }

    const fallbackUrl = process.env.CIRCLES_URL || "http://localhost:3000";
    let baseUrl = explicitBaseUrl || requestOrigin || fallbackUrl;

    // Guard against internal docker host links in all local-style runs.
    // If configured base is internal-only (e.g. http://db), prefer request origin.
    try {
        const parsed = new URL(baseUrl);
        if (parsed.hostname === "db") {
            baseUrl = requestOrigin || "http://localhost:3000";
        }
    } catch {
        baseUrl = requestOrigin || "http://localhost:3000";
    }

    return normalizeBaseUrl(baseUrl);
}

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

            const baseUrl = await resolveResetBaseUrl();
            const resetLink = `${baseUrl}/reset-password?token=${unhashedToken}`;
            let isLocalBaseUrl = false;
            try {
                isLocalBaseUrl = isLocalHost(new URL(baseUrl).hostname);
            } catch {
                isLocalBaseUrl = false;
            }
            const shouldLogResetLink =
                isLocalBaseUrl ||
                (process.env.CIRCLES_DEV_LOG_PASSWORD_RESET === "true" && process.env.NODE_ENV !== "production");

            if (shouldLogResetLink) {
                console.log(`[DEV_RESET_LINK] email=${user.email} url=${resetLink} token=${unhashedToken}`);
            }

            try {
                await sendEmail({
                    to: user.email!, // user.email is guaranteed to exist if user is found by email
                    templateAlias: "password-reset", // As per spec
                    templateModel: {
                        name: user.name || "User",
                        actionUrl: resetLink,
                        product_name: "Kamooni", // Or from process.env
                        product_url: baseUrl,
                        support_url: `${baseUrl}/support`, // Example, adjust as needed
                        // For operating_system and browser_name, you'd need to find a way to pass these
                        // from the client if desired, or extract from request headers if possible in server actions.
                        // For now, they will be omitted or you can pass placeholder values.
                        // operating_system: "Unknown", // Placeholder
                        // browser_name: "Unknown", // Placeholder
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
