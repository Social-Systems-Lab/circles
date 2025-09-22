"use server";

import { revalidatePath } from "next/cache";
import { Circles, Notifications } from "@/lib/data/db";
import { deleteCircle } from "@/lib/data/circle";
import { Circle, UserPrivate } from "@/models/models";
import { ObjectId } from "mongodb";
import { getAuthenticatedUserDid, getServerPublicKey } from "@/lib/auth/auth";
import { getUserPrivate } from "@/lib/data/user";
import { sendNotifications } from "@/lib/data/matrix";
import { sendUserVerificationRejectedNotification, sendUserVerifiedNotification } from "@/lib/data/notifications";
import { sendEmail } from "@/lib/data/email";
import { GlobalServerSettingsFormData, globalServerSettingsValidationSchema } from "./global-server-settings-schema";
import { getServerSettings, registerServer, updateServerSettings, urlIsLocal } from "@/lib/data/server-settings";
import { ServerSettings, VerificationRequest } from "@/models/models";
import { upsertVdbCollections } from "@/lib/data/vdb"; // Import the re-indexing function
import { db } from "@/lib/data/db";
import { getCircleById } from "@/lib/data/circle";
import { getUserByDid } from "@/lib/data/user";

// Get all circles of a specific type
export async function getEntitiesByType(type: "circle" | "user" | "project") {
    // check if user is admin
    let userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        throw new Error("Unauthorized: You do not have permission to access this resource.");
    }
    let user = await getUserPrivate(userDid);
    if (!user.isAdmin) {
        throw new Error("Unauthorized: You do not have permission to access this resource.");
    }

    try {
        const entities = await Circles.find(
            { circleType: type },
            {
                projection: {
                    _id: 1,
                    name: 1,
                    handle: 1,
                    email: 1,
                    picture: 1,
                    did: 1,
                    description: 1,
                    createdAt: 1,
                    members: 1,
                    isAdmin: 1,
                    isVerified: 1,
                },
            },
        ).toArray();

        return entities.map((entity) => ({
            ...entity,
            _id: entity._id.toString(),
        }));
    } catch (error) {
        console.error(`Error fetching ${type}s:`, error);
        throw new Error(`Failed to fetch ${type}s`);
    }
}

// Trigger re-indexing of all VDB collections
export async function triggerReindexAction() {
    // Check if user is admin
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "Unauthorized: You must be logged in." };
    }
    const user = await getUserPrivate(userDid);
    if (!user.isAdmin) {
        return { success: false, message: "Unauthorized: You do not have permission." };
    }

    console.log("Admin triggered re-indexing...");

    try {
        // Call the function to upsert all collections
        await upsertVdbCollections();
        console.log("Re-indexing process completed successfully via admin action.");
        return { success: true, message: "Re-indexing process completed successfully." };
    } catch (error) {
        console.error("Error during admin-triggered re-indexing:", error);
        return {
            success: false,
            message: error instanceof Error ? error.message : "Failed to complete re-indexing process.",
        };
    }
}

// Delete an entity (circle, user, or project)
export async function deleteEntity(id: string) {
    // check if user is admin
    let userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        throw new Error("Unauthorized: You do not have permission to access this resource.");
    }
    let user = await getUserPrivate(userDid);
    if (!user.isAdmin) {
        throw new Error("Unauthorized: You do not have permission to access this resource.");
    }

    try {
        await deleteCircle(id);
        revalidatePath("/admin");
        return { success: true, message: "Entity deleted successfully" };
    } catch (error) {
        console.error("Error deleting entity:", error);
        return {
            success: false,
            message: error instanceof Error ? error.message : "Failed to delete entity",
        };
    }
}

// Get all super admins
export async function getSuperAdmins() {
    // check if user is admin
    let userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        throw new Error("Unauthorized: You do not have permission to access this resource.");
    }
    let user = await getUserPrivate(userDid);
    if (!user.isAdmin) {
        throw new Error("Unauthorized: You do not have permission to access this resource.");
    }

    try {
        const admins = await Circles.find(
            { isAdmin: true, circleType: "user" },
            {
                projection: {
                    _id: 1,
                    name: 1,
                    handle: 1,
                    picture: 1,
                    did: 1,
                    email: 1,
                },
            },
        ).toArray();

        return admins.map((admin) => ({
            ...admin,
            _id: admin._id.toString(),
        }));
    } catch (error) {
        console.error("Error fetching super admins:", error);
        throw new Error("Failed to fetch super admins");
    }
}

// Toggle user verification status
export async function toggleUserVerification(userId: string, isVerified: boolean) {
    // check if user is admin
    let userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        throw new Error("Unauthorized: You do not have permission to access this resource.");
    }
    let adminUser = await getUserPrivate(userDid);
    if (!adminUser.isAdmin) {
        throw new Error("Unauthorized: You do not have permission to access this resource.");
    }

    try {
        await Circles.updateOne({ _id: new ObjectId(userId) }, { $set: { isVerified } });

        if (isVerified) {
            const userToNotify = (await Circles.findOne({
                _id: new ObjectId(userId),
                circleType: "user",
            })) as UserPrivate;

            if (userToNotify) {
                await sendUserVerifiedNotification(userToNotify);
            }
        }

        revalidatePath("/admin");
        return {
            success: true,
            message: `User ${isVerified ? "verified" : "unverified"} successfully`,
        };
    } catch (error) {
        console.error("Error updating user verification status:", error);
        return {
            success: false,
            message: error instanceof Error ? error.message : "Failed to update user verification status",
        };
    }
}

// Toggle super admin status
export async function toggleSuperAdmin(userId: string, isAdmin: boolean) {
    // check if user is admin
    let userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        throw new Error("Unauthorized: You do not have permission to access this resource.");
    }
    let user = await getUserPrivate(userDid);
    if (!user.isAdmin) {
        throw new Error("Unauthorized: You do not have permission to access this resource.");
    }

    try {
        await Circles.updateOne({ _id: new ObjectId(userId) }, { $set: { isAdmin } });
        revalidatePath("/admin");
        return {
            success: true,
            message: `User ${isAdmin ? "promoted to" : "removed from"} super admin role`,
        };
    } catch (error) {
        console.error("Error updating super admin status:", error);
        return {
            success: false,
            message: error instanceof Error ? error.message : "Failed to update super admin status",
        };
    }
}

// Save global server settings
export async function saveGlobalServerSettings(data: GlobalServerSettingsFormData) {
    // Check if user is admin
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "Unauthorized: You must be logged in." };
    }
    const user = await getUserPrivate(userDid);
    if (!user.isAdmin) {
        return { success: false, message: "Unauthorized: You do not have permission." };
    }

    // Validate data
    const validationResult = globalServerSettingsValidationSchema.safeParse(data);
    if (!validationResult.success) {
        // Combine Zod error messages
        const errorMessages = validationResult.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join(", ");
        return { success: false, message: `Invalid data: ${errorMessages}` };
    }

    const validatedData = validationResult.data;

    try {
        // Fetch current settings to compare registry URL
        const currentSettings = await getServerSettings();

        // Update the settings in the database
        await updateServerSettings(validatedData as ServerSettings); // Cast needed as DB model might have more fields

        // Handle registry registration if URL changed and is valid
        if (
            validatedData.registryUrl &&
            validatedData.registryUrl !== currentSettings.registryUrl &&
            validatedData.did && // Ensure server DID exists
            validatedData.name &&
            validatedData.url
        ) {
            const localServerAndRemoteRegistry =
                urlIsLocal(validatedData.url) && !urlIsLocal(validatedData.registryUrl);
            if (!localServerAndRemoteRegistry) {
                try {
                    const publicKey = getServerPublicKey();
                    const registryInfo = await registerServer(
                        validatedData.did,
                        validatedData.name,
                        validatedData.url,
                        validatedData.registryUrl,
                        publicKey,
                    );
                    // Save updated registry info back to settings
                    await updateServerSettings({
                        ...validatedData,
                        activeRegistryInfo: registryInfo,
                    } as ServerSettings);
                    console.log("Server re-registered with registry successfully.");
                } catch (regError) {
                    console.error("Failed to re-register server with registry after settings update:", regError);
                    // Don't fail the whole operation, just log the registry error
                }
            } else {
                console.warn("Skipping registry registration: Local server with remote registry detected.");
            }
        }

        revalidatePath("/admin"); // Revalidate admin path to reflect changes
        return { success: true, message: "Global server settings updated successfully." };
    } catch (error) {
        console.error("Error updating global server settings:", error);
        return {
            success: false,
            message: error instanceof Error ? error.message : "Failed to update global server settings.",
        };
    }
}

// Get platform statistics
export async function getPlatformStats() {
    // check if user is admin
    let userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        throw new Error("Unauthorized: You do not have permission to access this resource.");
    }
    let user = await getUserPrivate(userDid);
    if (!user.isAdmin) {
        throw new Error("Unauthorized: You do not have permission to access this resource.");
    }

    try {
        const circlesCount = await Circles.countDocuments({ circleType: "circle" });
        const usersCount = await Circles.countDocuments({ circleType: "user" });
        const projectsCount = await Circles.countDocuments({ circleType: "project" });
        const adminsCount = await Circles.countDocuments({ isAdmin: true, circleType: "user" });

        return {
            circles: circlesCount,
            users: usersCount,
            projects: projectsCount,
            admins: adminsCount,
        };
    } catch (error) {
        console.error("Error fetching platform stats:", error);
        throw new Error("Failed to fetch platform statistics");
    }
}

export async function getVerificationRequests() {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        throw new Error("Unauthorized");
    }
    const user = await getUserPrivate(userDid);
    if (!user.isAdmin) {
        throw new Error("Unauthorized");
    }

    const verificationCollection = db.collection<VerificationRequest>("verifications");
    const requests = await verificationCollection
        .aggregate([
            { $match: { status: "pending" } },
            {
                $lookup: {
                    from: "circles",
                    localField: "userDid",
                    foreignField: "did",
                    as: "user",
                },
            },
            { $unwind: "$user" },
            {
                $project: {
                    _id: { $toString: "$_id" },
                    userDid: 1,
                    requestedAt: 1,
                    user: {
                        name: "$user.name",
                        picture: "$user.picture",
                        email: "$user.email",
                    },
                },
            },
        ])
        .toArray();
    return requests as (VerificationRequest & { user: { name: string; picture: { url: string }; email: string } })[];
}

export async function approveVerificationRequest(id: string) {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        throw new Error("Unauthorized");
    }
    const user = await getUserPrivate(userDid);
    if (!user.isAdmin) {
        throw new Error("Unauthorized");
    }

    const verificationCollection = db.collection<VerificationRequest>("verifications");
    const request = await verificationCollection.findOne({ _id: new ObjectId(id) });
    if (!request) {
        throw new Error("Request not found");
    }

    await Circles.updateOne({ did: request.userDid }, { $set: { isVerified: true } });
    await verificationCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: "approved", reviewedAt: new Date(), reviewedBy: user.did } },
    );

    const userToNotify = await getUserPrivate(request.userDid);
    if (userToNotify) {
        await sendUserVerifiedNotification(userToNotify);
    }

    revalidatePath("/admin");
}

export async function rejectVerificationRequest(id: string) {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        throw new Error("Unauthorized");
    }
    const user = await getUserPrivate(userDid);
    if (!user.isAdmin) {
        throw new Error("Unauthorized");
    }

    const verificationCollection = db.collection<VerificationRequest>("verifications");
    const request = await verificationCollection.findOne({ _id: new ObjectId(id) });
    if (!request) {
        throw new Error("Request not found");
    }

    await verificationCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: "rejected", reviewedAt: new Date(), reviewedBy: user.did } },
    );

    const userToNotify = await getUserPrivate(request.userDid);
    if (userToNotify) {
        await sendUserVerificationRejectedNotification(userToNotify);
    }

    revalidatePath("/admin");
}

export async function getCircleByIdAction(id: string) {
    return await getCircleById(id);
}

export async function getUserByDidAction(did: string) {
    return await getUserByDid(did);
}

export async function toggleManualMembership(userId: string, manualMember: boolean) {
    try {
        const users = await db.collection("circles");
        const result = await users.updateOne({ _id: new ObjectId(userId) }, { $set: { manualMember } });

        if (result.modifiedCount === 0) {
            return { success: false, message: "User not found or membership status unchanged." };
        }

        return { success: true, message: `User manual membership status set to ${manualMember}.` };
    } catch (error) {
        console.error("Error toggling manual membership:", error);
        const message = error instanceof Error ? error.message : "An unexpected error occurred.";
        return { success: false, message };
    }
}

export async function syncAllDonorboxSubscriptions() {
    // Check if user is admin
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "Unauthorized: You must be logged in." };
    }
    const user = await getUserPrivate(userDid);
    if (!user.isAdmin) {
        return { success: false, message: "Unauthorized: You do not have permission." };
    }

    console.log("Admin triggered sync of all Donorbox subscriptions...");

    try {
        let allPlans: any[] = [];
        let page = 1;
        const perPage = 100;
        let hasMore = true;

        while (hasMore) {
            const response = await fetch(`https://donorbox.org/api/v1/plans?page=${page}&per_page=${perPage}`, {
                headers: {
                    Authorization: `Basic ${Buffer.from(
                        `${process.env.DONORBOX_API_USER}:${process.env.DONORBOX_API_KEY}`,
                    ).toString("base64")}`,
                },
            });

            if (!response.ok) {
                const errorData = await response.json();
                console.error("Donorbox API error:", errorData);
                return { success: false, message: "Failed to fetch plans from Donorbox." };
            }

            const plans = await response.json();
            if (plans.length > 0) {
                allPlans = allPlans.concat(plans);
                page++;
            } else {
                hasMore = false;
            }
        }

        let updatedCount = 0;
        let errorCount = 0;

        const dbUsers = await Circles.find({ circleType: "user" }).toArray();
        const userMap = new Map(dbUsers.map((u) => [u.email, u]));
        const processedUserIds = new Set();

        for (const plan of allPlans) {
            try {
                const userToUpdate = userMap.get(plan.donor.email);
                if (userToUpdate) {
                    processedUserIds.add(userToUpdate._id.toString());
                    const isMember = plan.status === "active";
                    const subscriptionData = {
                        donorboxPlanId: plan.id,
                        donorboxDonorId: plan.donor.id,
                        status: plan.status,
                        amount: plan.amount,
                        currency: plan.currency,
                        startDate: new Date(plan.started_at),
                        lastPaymentDate: new Date(plan.last_donation_date),
                    };

                    await Circles.updateOne(
                        { _id: userToUpdate._id },
                        { $set: { isMember, isVerified: isMember, subscription: subscriptionData } },
                    );
                    updatedCount++;
                }
            } catch (e) {
                console.error(`Error processing plan for donor ${plan.donor.email}:`, e);
                errorCount++;
            }
        }

        // Handle users who were members but are no longer in the active plans
        for (const dbUser of dbUsers) {
            if (dbUser.isMember && !processedUserIds.has(dbUser._id.toString())) {
                await Circles.updateOne(
                    { _id: dbUser._id },
                    { $set: { isMember: false, "subscription.status": "inactive" } },
                );
                updatedCount++;
            }
        }

        const message = `Subscription sync completed. Processed: ${updatedCount}, Errors: ${errorCount}.`;
        console.log(message);
        revalidatePath("/admin");
        return { success: true, message };
    } catch (error) {
        console.error("Error during Donorbox sync:", error);
        const message = error instanceof Error ? error.message : "Failed to complete Donorbox sync.";
        return { success: false, message };
    }
}

export async function triggerCronEmailReminder() {
    // Check if user is admin
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "Unauthorized: You must be logged in." };
    }
    const adminUser = await getUserPrivate(userDid);
    if (!adminUser.isAdmin) {
        return { success: false, message: "Unauthorized: You do not have permission." };
    }

    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
        return { success: false, message: "CRON_SECRET is not configured on the server." };
    }

    const baseUrl = (process.env.CIRCLES_URL || "http://localhost:3000").replace(/\/+$/, "");
    const url = `${baseUrl}/api/cron/email-reminders`;

    try {
        const resp = await fetch(url, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${cronSecret}`,
            },
        });

        if (!resp.ok) {
            let body = "";
            try {
                body = await resp.text();
            } catch {}
            return {
                success: false,
                message: `Cron endpoint returned ${resp.status} ${resp.statusText}${body ? `: ${body}` : ""}`,
            };
        }

        const data = await resp.json().catch(() => ({}));
        return {
            success: true,
            message: "Cron email reminders triggered successfully.",
            data,
        };
    } catch (error) {
        console.error("Error triggering cron email reminders:", error);
        return {
            success: false,
            message: error instanceof Error ? error.message : "Failed to call cron endpoint.",
        };
    }
}

export async function sendReminderEmailForHandle(handle: string) {
    // Check if user is admin
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "Unauthorized: You must be logged in." };
    }
    const adminUser = await getUserPrivate(userDid);
    if (!adminUser.isAdmin) {
        return { success: false, message: "Unauthorized: You do not have permission." };
    }

    try {
        const normalized = handle.trim().toLowerCase().replace(/^@/, "");
        if (!normalized) {
            return { success: false, message: "Please provide a valid handle." };
        }

        const user = await Circles.findOne({
            handle: normalized,
            circleType: "user",
            agreedToEmailUpdates: true,
        });

        if (!user) {
            return {
                success: false,
                message: "User not found or user has not agreed to email updates.",
            };
        }

        if (!user.email) {
            return { success: false, message: "User does not have an email address." };
        }

        const unreadNotifications = await Notifications.find({
            userId: user.did,
            isRead: false,
            lastEmailedAt: { $exists: false },
            createdAt: { $lt: new Date(Date.now() - 60 * 60 * 1000) }, // same threshold as cron
            $or: [{ type: { $ne: "pm_received" } }, { type: "pm_received" }],
        }).toArray();

        if (unreadNotifications.length === 0) {
            return {
                success: true,
                message: "No pending notifications to email for this user.",
                count: 0,
            };
        }

        await sendEmail({
            to: user.email,
            templateAlias: "notification-reminder",
            templateModel: {
                name: user.name,
                notifications: unreadNotifications.map((n: any) => n.content),
                actionUrl: process.env.CIRCLES_URL || "http://localhost:3000",
            },
        });

        const notificationIds = unreadNotifications.map((n: any) => n._id);
        await Notifications.updateMany({ _id: { $in: notificationIds } }, { $set: { lastEmailedAt: new Date() } });

        return {
            success: true,
            message: `Sent reminder email with ${unreadNotifications.length} notifications.`,
            count: unreadNotifications.length,
        };
    } catch (error) {
        console.error("Error sending reminder email for handle:", error);
        return {
            success: false,
            message: error instanceof Error ? error.message : "Failed to send reminder email.",
        };
    }
}

export async function refreshSubscriptionStatus(userId: string) {
    try {
        const user = await Circles.findOne({ _id: new ObjectId(userId) });
        if (!user) {
            return { success: false, message: "User not found" };
        }

        const donorboxDonorId = user.subscription?.donorboxDonorId;
        if (!donorboxDonorId) {
            return { success: false, message: "User does not have a Donorbox donor ID." };
        }

        const response = await fetch(`https://donorbox.org/api/v1/donors/${donorboxDonorId}/subscriptions`, {
            headers: {
                Authorization: `Basic ${Buffer.from(
                    `${process.env.DONORBOX_API_USER}:${process.env.DONORBOX_API_KEY}`,
                ).toString("base64")}`,
            },
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error("Donorbox API error:", errorData);
            return { success: false, message: "Failed to fetch subscription status from Donorbox." };
        }

        const subscriptions = await response.json();
        const activeSubscription = subscriptions.find((sub: any) => sub.status === "active");

        const isMember = !!activeSubscription;
        const subscriptionData = activeSubscription
            ? {
                  donorboxPlanId: activeSubscription.plan_id,
                  donorboxSubscriptionId: activeSubscription.id,
                  status: "active" as "active" | "inactive" | "cancelled",
                  amount: activeSubscription.amount,
                  currency: activeSubscription.currency,
                  startDate: new Date(activeSubscription.created_at),
                  lastPaymentDate: new Date(activeSubscription.last_payment_date),
              }
            : { status: "inactive" as "active" | "inactive" | "cancelled" };

        await Circles.updateOne({ _id: new ObjectId(userId) }, { $set: { isMember, subscription: subscriptionData } });

        revalidatePath("/admin");
        return {
            success: true,
            message: "Subscription status refreshed successfully.",
            isMember,
            subscription: subscriptionData,
        };
    } catch (error) {
        console.error("Error refreshing subscription status:", error);
        const message = error instanceof Error ? error.message : "An unexpected error occurred.";
        return { success: false, message };
    }
}
