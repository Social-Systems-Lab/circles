"use server";

import { FormSubmitResponse } from "../../../models/models";
import { AuthenticationError, authenticateUser, createUserSession, USERS_DIR } from "@/lib/auth/auth";
import { Circles } from "@/lib/data/db";
import { getUserPrivate } from "@/lib/data/user";
import fs from "fs";
import path from "path";

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export const submitLoginFormAction = async (values: Record<string, any>): Promise<FormSubmitResponse> => {
    try {
        const emailInput = typeof values.email === "string" ? values.email : "";
        const normalizedEmail = emailInput.trim();
        let password = values.password;

        if (process.env.NODE_ENV !== "production") {
            console.log(`[LOGIN_DIAG] normalizedEmail='${normalizedEmail.toLowerCase()}'`);
        }

        // Prefer exact email lookup with case-insensitive collation for deterministic matching.
        let user = await Circles.findOne(
            { email: normalizedEmail },
            { collation: { locale: "en", strength: 2 } },
        );
        if (!user) {
            // Fallback for legacy records: exact escaped regex (still case-insensitive).
            const emailRegex = new RegExp(`^${escapeRegExp(normalizedEmail)}$`, "i");
            user = await Circles.findOne({ email: { $regex: emailRegex } });
        }

        if (!user) {
            console.error("Login failed: Account does not exist for email:", normalizedEmail);
            throw new AuthenticationError("Account does not exist");
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

        authenticateUser(user.did!, password);

        let privateUser = await getUserPrivate(user.did!);
        await createUserSession(privateUser, user.did!);

        return { success: true, message: "User authenticated successfully", data: { user: privateUser } };
    } catch (error) {
        if (error instanceof AuthenticationError) {
            if (process.env.NODE_ENV !== "production") {
                const reason =
                    error.message === "Account does not exist"
                        ? "missing_user_or_credentials"
                        : error.message === "Incorrect password"
                          ? "password_mismatch"
                          : "auth_error";
                console.log(`[LOGIN_DIAG] verificationBranch=${reason} message="${error.message}"`);
            }
            return { success: false, message: error.message };
        }

        if (error instanceof Error) {
            const errorText = `${error.name}: ${error.message}`;
            const isDbError = /(mongo|topology|econnrefused|connection|timed out|server selection)/i.test(errorText);

            console.error("Login failed with non-auth error", {
                email: typeof values?.email === "string" ? values.email.trim() : values?.email,
                error: errorText,
            });

            if (isDbError) {
                return { success: false, message: "Login is temporarily unavailable due to a database issue." };
            }

            return { success: false, message: "Login failed due to a server error. Please try again." };
        }

        console.error("Login failed with unknown error", error);
        return { success: false, message: "Login failed due to an unexpected error. Please try again." };
    }
};
