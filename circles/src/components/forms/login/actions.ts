"use server";

import { FormSubmitResponse } from "../../../models/models";
import { AuthenticationError, authenticateUser, createUserSession, USERS_DIR } from "@/lib/auth/auth";
import { Circles } from "@/lib/data/db";
import { getUserPrivate } from "@/lib/data/user";
import fs from "fs";
import path from "path";
import { toAuthenticatedClientUser } from "@/lib/data/client-user-dto";
import { headers } from "next/headers";
import {
    abandonLoginAttempt,
    beginLoginAttempt,
    clearSuccessfulLogin,
    GENERIC_INVALID_CREDENTIALS,
    LoginAttemptLease,
    LoginRateLimitStorageError,
    LOGIN_TEMPORARILY_UNAVAILABLE,
    LoginThrottledError,
    normalizeLoginIdentifier,
    recordFailedLogin,
    trustedLoginClientIp,
    verifyDummyLoginPassword,
} from "@/lib/auth/login-security";

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export const submitLoginFormAction = async (values: Record<string, any>): Promise<FormSubmitResponse> => {
    let lease: LoginAttemptLease | undefined;
    try {
        const emailInput = typeof values.email === "string" ? values.email : "";
        const normalizedEmail = emailInput.trim();
        const password = typeof values.password === "string" ? values.password : "";
        const requestHeaders = await headers();
        // Production nginx overwrites X-Real-IP with $remote_addr. Never use X-Forwarded-For here.
        const clientIp = trustedLoginClientIp(requestHeaders.get("x-real-ip"));
        lease = await beginLoginAttempt(clientIp, normalizeLoginIdentifier(normalizedEmail));

        // Prefer exact email lookup with case-insensitive collation for deterministic matching.
        let user = await Circles.findOne({ email: normalizedEmail }, { collation: { locale: "en", strength: 2 } });
        if (!user) {
            // Fallback for legacy records: exact escaped regex (still case-insensitive).
            const emailRegex = new RegExp(`^${escapeRegExp(normalizedEmail)}$`, "i");
            user = await Circles.findOne({ email: { $regex: emailRegex } });
        }

        if (!user) {
            verifyDummyLoginPassword(password);
            const failedLease = lease;
            lease = undefined;
            await recordFailedLogin(failedLease);
            return { success: false, message: GENERIC_INVALID_CREDENTIALS };
        }
        if (process.env.NODE_ENV !== "production") {
            const credentialPath = path.join(USERS_DIR, user.did || "");
            console.log(
                `[LOGIN_DIAG] userId=${user._id?.toString()} did=${user.did} credentialSource=file path=${credentialPath} exists=${fs.existsSync(
                    credentialPath,
                )}`,
            );
        }

        // Check if email is verified
        // TEMPORARILY DISABLED FOR TESTING
        /*
        if (!user.isEmailVerified) {
            // Optionally, trigger a resend of verification email here
            // For now, just inform the user.
            // You could add a specific error code or flag to the response
            // to allow the frontend to show a "Resend verification email" button.
            return {
                success: false,
                message: "Email not verified. Please check your inbox for the verification link.",
                // errorCode: "EMAIL_NOT_VERIFIED" // Example for frontend handling
            };
        }
        */

        try {
            authenticateUser(user.did!, password);
        } catch (error) {
            if (error instanceof AuthenticationError && error.message === "Incorrect password") {
                const failedLease = lease;
                lease = undefined;
                await recordFailedLogin(failedLease);
                return { success: false, message: GENERIC_INVALID_CREDENTIALS };
            }
            throw error;
        }

        const successfulLease = lease;
        lease = undefined;
        await clearSuccessfulLogin(successfulLease);

        let privateUser = await getUserPrivate(user.did!);
        await createUserSession(privateUser, user.did!);

        return {
            success: true,
            message: "User authenticated successfully",
            data: { user: toAuthenticatedClientUser(privateUser) },
        };
    } catch (error) {
        if (lease) {
            try {
                await abandonLoginAttempt(lease);
            } catch (cleanupError) {
                console.error("Login limiter cleanup failed", cleanupError);
                return { success: false, message: LOGIN_TEMPORARILY_UNAVAILABLE };
            }
        }
        if (error instanceof LoginThrottledError) {
            return { success: false, message: LOGIN_TEMPORARILY_UNAVAILABLE };
        }
        if (error instanceof LoginRateLimitStorageError) {
            console.error("Login limiter storage failed", error);
            return { success: false, message: LOGIN_TEMPORARILY_UNAVAILABLE };
        }
        if (error instanceof AuthenticationError) {
            return { success: false, message: GENERIC_INVALID_CREDENTIALS };
        }

        if (error instanceof Error) {
            const errorText = `${error.name}: ${error.message}`;
            const isDbError = /(mongo|topology|econnrefused|connection|timed out|server selection)/i.test(errorText);

            console.error("Login failed with non-auth error", { error: errorText });

            if (isDbError) {
                return { success: false, message: "Login is temporarily unavailable due to a database issue." };
            }

            return { success: false, message: "Login failed due to a server error. Please try again." };
        }

        console.error("Login failed with unknown error", error);
        return { success: false, message: "Login failed due to an unexpected error. Please try again." };
    }
};
