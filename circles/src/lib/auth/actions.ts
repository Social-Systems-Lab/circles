"use server";

import crypto from "crypto";
import { z } from "zod";
import { Circles, Tasks } from "../data/db";
import { getAuthenticatedUserDid } from "./auth";
import { getUserById, getUserPrivate } from "../data/user";
import { ObjectId } from "mongodb";
import { revalidatePath } from "next/cache";
import fs from "fs/promises"; // Use promises for async file operations
import path from "path";
import {
    APP_DIR,
    ENCRYPTION_ALGORITHM,
    ENCRYPTED_PRIVATE_KEY_FILENAME,
    IV_FILENAME,
    PUBLIC_KEY_FILENAME,
    SALT_FILENAME,
    USERS_DIR,
} from "./auth"; // Import constants and getDid
import {
    Members,
    Posts,
    Comments,
    Reactions,
    MembershipRequests,
    ChatRoomMembers,
    Proposals,
    Issues,
} from "../data/db"; // Import necessary collections
import { passwordSchema, emailSchema } from "@/models/models"; // Import schemas

// Schema for the initiatePasswordReset action input
const initiateResetSchema = z.object({
    userId: z.string(), // MongoDB ObjectId string
});

// Type for the return value of initiatePasswordReset
type InitiateResetResult = { success: true; token: string } | { success: false; error: string };

/**
 * Server Action for Admins to initiate the password reset process for a user.
 * Generates a reset token, stores its hash, and returns the unhashed token.
 * @param formData - FormData containing the userId.
 */
export async function initiatePasswordReset(userId: string): Promise<InitiateResetResult> {
    try {
        console.log("userID:", userId);

        // check if user is admin
        let userDid = await getAuthenticatedUserDid();
        if (!userDid) {
            throw new Error("Unauthorized: You do not have permission to access this resource.");
        }
        let currentUser = await getUserPrivate(userDid);
        if (!currentUser.isAdmin) {
            throw new Error("Unauthorized: You do not have permission to access this resource.");
        }

        // Validate input
        const result = initiateResetSchema.safeParse({
            userId: userId,
        });
        if (!result.success) {
            return { success: false, error: "Invalid user ID provided." };
        }

        // Verify the target user exists
        const targetUser = await Circles.findOne({ _id: new ObjectId(userId) });
        if (!targetUser) {
            return { success: false, error: "Target user not found." };
        }

        // Generate token and expiry
        const unhashedToken = crypto.randomBytes(32).toString("hex");
        const expiry = new Date(Date.now() + 3600 * 1000); // 1 hour expiry

        // Hash the token (using SHA-256 for simplicity, consider bcrypt in production)
        const hashedToken = crypto.createHash("sha256").update(unhashedToken).digest("hex");

        // Update the target user's document
        const updateResult = await Circles.updateOne(
            { _id: new ObjectId(userId) },
            {
                $set: {
                    passwordResetToken: hashedToken,
                    passwordResetTokenExpiry: expiry,
                },
            },
        );

        if (updateResult.modifiedCount !== 1) {
            console.error(`Failed to update password reset token for user ${userId}`);
            return {
                success: false,
                error: "Failed to initiate reset. Please try again.",
            };
        }

        // Revalidate admin path if necessary (adjust path as needed)
        revalidatePath("/admin"); // Or specific admin user management path

        // Return the unhashed token
        return { success: true, token: unhashedToken };
    } catch (error) {
        console.error("Error initiating password reset:", error);
        return {
            success: false,
            error: "An unexpected error occurred. Please try again.",
        };
    }
}

// --- Reset Password Action ---

// Schema for the resetPassword action input
const resetPasswordSchema = z.object({
    token: z.string().min(1, "Reset token is required."),
    email: emailSchema,
    password: passwordSchema,
    // It's good practice to have password confirmation on the client-side,
    // but the server action only needs the final password.
});

// Type for the return value of resetPassword
type ResetPasswordResult = { success: true } | { success: false; error: string };

/**
 * Server Action for Users to reset their password using a valid token.
 * Verifies the token, generates a new identity (DID, keys), updates filesystem,
 * updates the user record, and updates all references to the old DID in the DB.
 * @param formData - FormData containing token, email, and new password.
 */
export async function resetPassword(token: string, email: string, password: string): Promise<ResetPasswordResult> {
    try {
        // 1. Validate input
        const result = resetPasswordSchema.safeParse({
            token,
            email,
            password,
        });
        if (!result.success) {
            // Combine Zod errors for better feedback if needed
            const errors = result.error.errors.map((e) => e.message).join(", ");
            return { success: false, error: `Invalid input: ${errors}` };
        }

        // 2. Find user by email and verify token state
        const user = await Circles.findOne({ email: email });
        if (!user || !user.passwordResetToken || !user.passwordResetTokenExpiry) {
            return { success: false, error: "Invalid or expired reset token." };
        }

        // 3. Hash the provided token for comparison
        const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

        // 4. Verify token hash and expiry
        if (hashedToken !== user.passwordResetToken) {
            return { success: false, error: "Invalid or expired reset token." };
        }
        if (new Date() > user.passwordResetTokenExpiry) {
            // Optionally clear the expired token here
            await Circles.updateOne(
                { _id: user._id },
                { $set: { passwordResetToken: null, passwordResetTokenExpiry: null } },
            );
            return { success: false, error: "Reset token has expired." };
        }

        // --- Token is valid, proceed with identity change ---

        const oldDid = user.did;
        if (!oldDid) {
            // Should not happen if user exists, but good to check
            return { success: false, error: "User identity information is missing." };
        }

        // 5. Generate New Identity
        const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
            modulusLength: 2048,
        });

        const newDid = crypto
            .createHash("sha256")
            .update(publicKey.export({ type: "pkcs1", format: "pem" }) as string)
            .digest("hex");

        // 6. Secure New Private Key
        const newSalt = crypto.randomBytes(16); // newSalt is Buffer
        const newIv = crypto.randomBytes(16); // newIv is Buffer
        // IMPORTANT: Use the *new* password and *new* salt here
        // encryptionKey will be inferred as Buffer
        const newEncryptionKey = crypto.pbkdf2Sync(password, newSalt, 100000, 32, "sha512");
        // Pass Buffers directly
        const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, newEncryptionKey, newIv);
        let newEncryptedPrivateKey = cipher.update(
            privateKey.export({ type: "pkcs1", format: "pem" }) as string,
            "utf8",
            "hex",
        );
        newEncryptedPrivateKey += cipher.final("hex");

        // 7. Update Filesystem
        const oldAccountPath = path.join(USERS_DIR, oldDid);
        const newAccountPath = path.join(USERS_DIR, newDid);

        try {
            // Check if old path exists before attempting removal
            const oldPathExists = await fs
                .access(oldAccountPath)
                .then(() => true)
                .catch(() => false);
            if (oldPathExists) {
                await fs.rm(oldAccountPath, { recursive: true, force: true });
            } else {
                console.warn(`Old user directory not found, skipping deletion: ${oldAccountPath}`);
                // Decide if this is an error or just a warning. If the DB update succeeds later,
                // it might be okay. If the user record *requires* the filesystem keys, this is an error.
                // For now, proceed with caution.
            }

            await fs.mkdir(newAccountPath, { recursive: true });
            // Pass Buffers and strings directly to writeFile
            await fs.writeFile(path.join(newAccountPath, SALT_FILENAME), newSalt);
            await fs.writeFile(path.join(newAccountPath, IV_FILENAME), newIv);
            await fs.writeFile(
                path.join(newAccountPath, PUBLIC_KEY_FILENAME),
                publicKey.export({ type: "pkcs1", format: "pem" }),
            );
            await fs.writeFile(path.join(newAccountPath, ENCRYPTED_PRIVATE_KEY_FILENAME), newEncryptedPrivateKey);
        } catch (fsError) {
            console.error("Filesystem error during password reset:", fsError);
            // Attempt to rollback or log critical failure?
            return { success: false, error: "Failed to update user identity files." };
        }

        let publicKeyPem = publicKey.export({ type: "pkcs1", format: "pem" });
        // 8. Update User Database Record (Primary)
        const userUpdateResult = await Circles.updateOne(
            { _id: user._id },
            {
                $set: {
                    did: newDid,
                    publicKey: publicKeyPem as string,
                    passwordResetToken: null, // Clear the token
                    passwordResetTokenExpiry: null,
                },
            },
        );

        if (userUpdateResult.modifiedCount !== 1) {
            console.error(`Failed to update primary user record for old DID ${oldDid} to new DID ${newDid}`);
            // Critical error - filesystem might be updated but DB is not. Needs manual intervention or rollback.
            return { success: false, error: "Failed to update user record. Please contact support." };
        }

        // 9. Update DID References Across Database (CRITICAL STEP)
        // Perform these updates concurrently for efficiency
        const updatePromises = [
            Members.updateMany({ userDid: oldDid }, { $set: { userDid: newDid } }),
            Posts.updateMany({ createdBy: oldDid }, { $set: { createdBy: newDid } }),
            Comments.updateMany({ createdBy: oldDid }, { $set: { createdBy: newDid } }),
            Reactions.updateMany({ userDid: oldDid }, { $set: { userDid: newDid } }),
            MembershipRequests.updateMany({ userDid: oldDid }, { $set: { userDid: newDid } }),
            ChatRoomMembers.updateMany({ userDid: oldDid }, { $set: { userDid: newDid } }),
            Proposals.updateMany({ createdBy: oldDid }, { $set: { createdBy: newDid } }),
            // Issues have two fields
            Issues.updateMany({ createdBy: oldDid }, { $set: { createdBy: newDid } }),
            Issues.updateMany({ assignedTo: oldDid }, { $set: { assignedTo: newDid } }),
            // Tasks have two fields
            Tasks.updateMany({ createdBy: oldDid }, { $set: { createdBy: newDid } }),
            Tasks.updateMany({ assignedTo: oldDid }, { $set: { assignedTo: newDid } }),
            // Update 'createdBy' in Circles if users can create circles/projects
            Circles.updateMany({ createdBy: oldDid }, { $set: { createdBy: newDid } }),
            // Add any other collections/fields that reference user DIDs here
        ];

        try {
            const updateResults = await Promise.all(updatePromises);
            // Optional: Log the number of documents updated in each collection
            console.log(
                `DID Reference Update Results for ${oldDid} -> ${newDid}:`,
                updateResults.map((r) => r.modifiedCount),
            );
        } catch (dbUpdateError) {
            console.error(`Error updating DID references from ${oldDid} to ${newDid}:`, dbUpdateError);
            // This is also critical. The primary user record is updated, but references are inconsistent.
            // Needs logging and potentially manual correction.
            return { success: false, error: "Failed to update all user data references. Please contact support." };
        }

        // 10. Update Matrix Integration (If needed - adapt based on actual implementation)
        // try {
        //     await registerOrLoginMatrixUser(await getUserById(newDid)); // Assuming getUserById works with new DID
        // } catch (matrixError) {
        //     console.error(`Matrix update failed for new DID ${newDid}:`, matrixError);
        //     // Non-critical? Log and continue, or return specific error?
        // }

        // 11. Revalidate relevant paths (e.g., user profile page if it uses DID)
        // revalidatePath(`/profile/${newDid}`); // Example

        return { success: true };
    } catch (error) {
        console.error("Error resetting password:", error);
        return {
            success: false,
            error: "An unexpected error occurred during password reset.",
        };
    }
}
