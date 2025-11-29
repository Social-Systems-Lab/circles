"use server";

import { FormSubmitResponse } from "../../../models/models";
import { AuthenticationError, authenticateUser, createUserSession } from "@/lib/auth/auth";
import { Circles } from "@/lib/data/db";
import { getUserPrivate } from "@/lib/data/user";

export const submitLoginFormAction = async (values: Record<string, any>): Promise<FormSubmitResponse> => {
    try {
        let email = values.email;
        let password = values.password;

        // get user by email (case-insensitive)
        const emailRegex = new RegExp(`^${email.trim()}$`, "i");
        console.log(`Login attempt for email: '${email.trim()}' with regex: ${emailRegex}`);
        let user = await Circles.findOne({ email: { $regex: emailRegex } });
        console.log("User found:", user ? user._id : "null");
        
        if (!user) {
            console.error("Login failed: Account does not exist for email:", email);
            throw new AuthenticationError("Account does not exist");
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
            return { success: false, message: error.message };
        } else if (error instanceof Error) {
            return { success: false, message: error.message };
        } else {
            return { success: false, message: "Failed to log in the user. " + JSON.stringify(error) };
        }
    }
};
