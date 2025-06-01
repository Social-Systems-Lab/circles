"use server";

import { z } from "zod";
import {
    didSchema,
    EntityType,
    entityTypeSchema,
    NotificationType,
    notificationTypeSchema,
    UserNotificationSetting,
    userNotificationSettingSchema,
    DefaultNotificationSetting,
    defaultNotificationSettingSchema,
    notificationTypeValues,
    GroupedNotificationSettings,
    UserPrivate,
    summaryNotificationTypes, // Import the new summary types
    summaryNotificationTypeDetails, // Import the details mapping
    SummaryNotificationType, // Import the type itself
} from "@/models/models";
import { getAuthenticatedUserDid } from "@/lib/auth/auth";
import { UserNotificationSettings, DefaultNotificationSettings } from "../data/db";
import { features } from "../data/constants"; // Import the features object
import { Circles, Members } from "../data/db"; // Import Circle and Member collections
import { ObjectId } from "mongodb";
import { getCircleById } from "../data/circle"; // Import getCircleById

// Ultimate fallback defaults if a DefaultNotificationSetting is not found in DB
const ultimateFallbackDefaults: Record<
    EntityType,
    Partial<Record<SummaryNotificationType, { defaultIsEnabled: boolean; requiredPermission?: string }>>
> = {
    CIRCLE: {
        COMMUNITY_FOLLOW_REQUEST: { defaultIsEnabled: true, requiredPermission: "members.manage_requests" },
        COMMUNITY_NEW_FOLLOWER: { defaultIsEnabled: false }, // Default to false
        POSTS_ALL: { defaultIsEnabled: true, requiredPermission: "feed.view" },
        PROPOSALS_ALL: { defaultIsEnabled: true, requiredPermission: "proposals.view" },
        ISSUES_ALL: { defaultIsEnabled: true, requiredPermission: "issues.view" },
        TASKS_ALL: { defaultIsEnabled: true, requiredPermission: "tasks.view" },
        GOALS_ALL: { defaultIsEnabled: true, requiredPermission: "goals.view" },
    },
    USER: {
        // Example for USER entity type, can be expanded
        // For USER entity, permissions are usually just "is this the user themselves?"
        // No module specific settings typically apply here unless we define them.
    },
    // Fallbacks for other entity types can be added here if needed
    POST: {},
    COMMENT: {},
    PROPOSAL: {},
    ISSUE: {},
    TASK: {},
    GOAL: {},
};

// Checks if a user has the 'requiredPermission' for a given entity and notification type
export const checkUserPermissionForNotification = async (
    userId: string, // User's DID
    entityType: EntityType,
    entityId: string, // ID of the entity instance (e.g. circleId, postId)
    requiredPermission?: string, // e.g., "feed.post" or "general.manage_membership_requests"
): Promise<boolean> => {
    if (!requiredPermission) {
        return true; // No specific permission required, always allow configuration
    }

    const parts = requiredPermission.split(".");
    if (parts.length !== 2) {
        console.warn(`Invalid requiredPermission format: ${requiredPermission}. Expected 'module.feature'.`);
        return false; // Invalid format, deny permission
    }
    const moduleName = parts[0];
    const featureName = parts[1];

    // @ts-ignore
    const featureDefinition = features[moduleName]?.[featureName];
    if (!featureDefinition) {
        console.warn(`Feature definition not found for permission: ${requiredPermission}`);
        return false; // Feature not defined, deny permission
    }

    if (entityType === "CIRCLE") {
        const circleId = entityId;
        try {
            const circle = await Circles.findOne({ _id: new ObjectId(circleId) });
            if (!circle) {
                console.warn(`Circle not found for permission check: ${circleId}`);
                return false;
            }

            const member = await Members.findOne({ userDid: userId, circleId: circleId });
            if (!member) {
                // If user is not a member, check if 'everyone' group has permission
                const allowedGroups =
                    circle.accessRules?.[moduleName]?.[featureName] || featureDefinition.defaultUserGroups || [];
                if (allowedGroups.includes("everyone")) {
                    return true;
                }
                console.warn(`User ${userId} is not a member of circle ${circleId} and 'everyone' not permitted.`);
                return false;
            }

            const memberUserGroups = member.userGroups || [];
            if (memberUserGroups.includes("admins")) return true; // Admins can always configure

            // Determine allowed groups: circle specific rules override default feature rules
            const allowedGroups =
                circle.accessRules?.[moduleName]?.[featureName] || featureDefinition.defaultUserGroups || [];

            // Check if any of the user's groups are in the allowed list
            const hasAccess = memberUserGroups.some((groupHandle) => allowedGroups.includes(groupHandle));

            if (!hasAccess) {
                console.log(
                    `User ${userId} (groups: ${memberUserGroups.join(
                        ", ",
                    )}) does not have required permission '${requiredPermission}' (allowed: ${allowedGroups.join(
                        ", ",
                    )}) for circle ${circleId}`,
                );
            }
            return hasAccess;
        } catch (error) {
            console.error(`Error checking CIRCLE permission for ${requiredPermission}:`, error);
            return false;
        }
    } else if (entityType === "USER") {
        // For entityType USER, the entityId is the target user's DID.
        // Permission means the requesting user is the same as the target user.
        return userId === entityId;
    } else {
        // TODO: Implement permission checks for other entity types (POST, COMMENT, TASK, GOAL, ISSUE, PROPOSAL etc.)
        // This might involve checking ownership (e.g., post author) or roles within a parent entity (e.g., circle).
        // For example, for a POST, you might need to fetch the post, find its parent circle,
        // and then check permissions within that circle.
        console.warn(
            `Permission check for entityType '${entityType}' (permission: '${requiredPermission}') is not fully implemented. Defaulting to true for now.`,
        );
        return true; // Default to true for other entity types until fully implemented
    }
};

/**
 * Fetches all notification settings for the current user,
 * combining user-specific preferences with defaults,
 * and filters them based on permissions.
 * The result is grouped by entityType and entityId.
 */
export async function getGroupedUserNotificationSettings(): Promise<GroupedNotificationSettings | { error: string }> {
    const userId = await getAuthenticatedUserDid();
    if (!userId) {
        return { error: "User not authenticated." };
    }

    try {
        const [userSettingsList, defaultSettingsList] = await Promise.all([
            UserNotificationSettings.find({ userId }).toArray(),
            DefaultNotificationSettings.find({}).toArray(),
        ]);

        const combinedSettings: GroupedNotificationSettings = {} as GroupedNotificationSettings;

        // Create a map for quick lookup of user settings
        const userSettingsMap = new Map<string, UserNotificationSetting>();
        userSettingsList.forEach((us) => {
            userSettingsMap.set(`${us.entityType}:${us.entityId}:${us.notificationType}`, us);
        });

        const allEntityTypes = entityTypeSchema.options; // Keep for cleaning loop, but main logic uses summaryNotificationTypes
        // const allNotificationTypes = notificationTypeValues; // We will use summaryNotificationTypes for the main loop

        // Determine all relevant entity IDs for the user
        const relevantEntityIds: { entityType: EntityType; entityId: string }[] = [];

        // 1. Add user's own profile (entityType: USER, entityId: userId)
        relevantEntityIds.push({ entityType: "USER", entityId: userId });

        // 2. Add all circles the user is a member of
        const memberships = await Members.find({ userDid: userId }).toArray();
        memberships.forEach((membership) => {
            relevantEntityIds.push({ entityType: "CIRCLE", entityId: membership.circleId });
        });

        // Potentially add other relevant entities here (e.g., posts authored by user, tasks assigned to user)
        // For now, focusing on USER and CIRCLE as per immediate need.

        const uniqueRelevantEntityIds = relevantEntityIds.filter(
            (value, index, self) =>
                index === self.findIndex((t) => t.entityType === value.entityType && t.entityId === value.entityId),
        );

        const processingPromises: Promise<void>[] = [];

        for (const { entityType, entityId } of uniqueRelevantEntityIds) {
            if (!combinedSettings[entityType]) {
                combinedSettings[entityType] = {};
            }
            if (!combinedSettings[entityType][entityId]) {
                combinedSettings[entityType][entityId] = {} as Record<
                    NotificationType,
                    { isEnabled: boolean; isConfigurable: boolean }
                >;
            }
            const currentEntitySettings = combinedSettings[entityType][entityId];

            // Fetch circle details if entityType is CIRCLE to check enabledModules
            let circleDetails: UserPrivate | null = null;
            let skipEntityProcessing = false;

            if (entityType === "CIRCLE") {
                circleDetails = (await getCircleById(entityId)) as UserPrivate;
                if (!circleDetails) {
                    // console.warn(
                    //     `[NotifSettings] Circle details not found for entityId: ${entityId}. Skipping settings for this entity.`,
                    // );
                    skipEntityProcessing = true;
                } else {
                    // console.log(
                    //     `[NotifSettings] Processing Circle ${entityId}. Enabled Modules: ${JSON.stringify(circleDetails.enabledModules)}`,
                    // );
                }
            }

            if (skipEntityProcessing) {
                // console.log(`[NotifSettings] Skipping entity ${entityId} due to earlier issue.`);
                continue;
            }

            for (const summaryNt of summaryNotificationTypes) {
                const summaryDetail = summaryNotificationTypeDetails[summaryNt];
                // console.log(`[NotifSettings] Checking summaryNt: ${summaryNt} for entity ${entityType}:${entityId}`);

                // Check if module is enabled for CIRCLE entityType
                if (entityType === "CIRCLE" && summaryDetail.moduleHandle) {
                    if (!circleDetails) {
                        // Should not happen if skipEntityProcessing worked, but as a safeguard
                        // console.warn(
                        //     `[NotifSettings] circleDetails is null for ${entityId} when checking module for ${summaryNt}. Skipping module check.`,
                        // );
                    } else if (!circleDetails.enabledModules) {
                        // console.warn(
                        //     `[NotifSettings] Circle ${entityId} has no enabledModules array. Module ${summaryDetail.moduleHandle} for ${summaryNt} cannot be checked. Assuming not enabled.`,
                        // );
                        continue;
                    } else if (!circleDetails.enabledModules.includes(summaryDetail.moduleHandle)) {
                        // console.log(
                        //     `[NotifSettings] Module ${summaryDetail.moduleHandle} (for ${summaryNt}) is NOT enabled for circle ${entityId}. Skipping this setting.`,
                        // );
                        continue;
                    } else {
                        // console.log(`[NotifSettings] Module ${summaryDetail.moduleHandle} (for ${summaryNt}) IS enabled for circle ${entityId}. Proceeding.`);
                    }
                }
                // For USER entityType, or if moduleHandle is undefined (general community notifications like follow requests), proceed.

                // Use the summaryNt for DefaultNotificationSetting lookup
                const defaultSetting = defaultSettingsList.find(
                    (ds) => ds.entityType === entityType && ds.notificationType === summaryNt,
                );

                if (defaultSetting) {
                    processingPromises.push(
                        (async () => {
                            // User setting should also be looked up using summaryNt
                            const userSetting = userSettingsMap.get(`${entityType}:${entityId}:${summaryNt}`);
                            const hasPermission = await checkUserPermissionForNotification(
                                userId,
                                entityType,
                                entityId,
                                defaultSetting.requiredPermission,
                            );

                            if (hasPermission) {
                                if (userSetting) {
                                    currentEntitySettings[summaryNt] = {
                                        isEnabled: userSetting.isEnabled,
                                        isConfigurable: true,
                                    };
                                } else {
                                    currentEntitySettings[summaryNt] = {
                                        isEnabled: defaultSetting.defaultIsEnabled,
                                        isConfigurable: true,
                                    };
                                }
                            }
                        })(),
                    );
                } else {
                    // If no default for the summary type, try using the ultimate fallback
                    const fallback = ultimateFallbackDefaults[entityType]?.[summaryNt as SummaryNotificationType];
                    if (fallback) {
                        // console.log(
                        //     `[NotifSettings] Using ultimate fallback for ${summaryNt} on ${entityType}:${entityId}`,
                        // );
                        processingPromises.push(
                            (async () => {
                                const userSetting = userSettingsMap.get(`${entityType}:${entityId}:${summaryNt}`);
                                const hasPermission = await checkUserPermissionForNotification(
                                    userId,
                                    entityType,
                                    entityId,
                                    fallback.requiredPermission,
                                );

                                if (hasPermission) {
                                    if (userSetting) {
                                        currentEntitySettings[summaryNt] = {
                                            isEnabled: userSetting.isEnabled,
                                            isConfigurable: true,
                                        };
                                    } else {
                                        currentEntitySettings[summaryNt] = {
                                            isEnabled: fallback.defaultIsEnabled,
                                            isConfigurable: true,
                                        };
                                    }
                                }
                            })(),
                        );
                    } else {
                        // console.warn(
                        //     `[NotifSettings] No default setting OR ultimate fallback found for summary type: ${summaryNt} and entity type: ${entityType}. Setting will not be available.`,
                        // );
                    }
                }
            }
        }

        await Promise.all(processingPromises);

        // Clean up empty entityId records and empty entityType records
        for (const et of allEntityTypes) {
            if (combinedSettings[et]) {
                for (const eid in combinedSettings[et]) {
                    if (Object.keys(combinedSettings[et][eid]).length === 0) {
                        delete combinedSettings[et][eid];
                    }
                }
                if (Object.keys(combinedSettings[et]).length === 0) {
                    delete combinedSettings[et];
                }
            }
        }

        return combinedSettings;
    } catch (error) {
        console.error("Error fetching grouped notification settings:", error);
        return { error: "Failed to fetch notification settings." };
    }
}

/**
 * Fetches default notification settings for a given entity type.
 */
export async function getDefaultSettingsForEntityType(
    entityType: EntityType,
): Promise<DefaultNotificationSetting[] | { error: string }> {
    try {
        const defaults = await DefaultNotificationSettings.find({ entityType }).toArray();
        return defaults;
    } catch (error) {
        console.error(`Error fetching default settings for entityType ${entityType}:`, error);
        return { error: `Failed to fetch default settings for ${entityType}.` };
    }
}

const updateSettingsSchema = z.object({
    entityType: entityTypeSchema,
    entityId: z.string(),
    notificationType: notificationTypeSchema,
    isEnabled: z.boolean(),
});

/**
 * Updates a specific notification setting for the current user.
 */
export async function updateUserNotificationSetting(
    input: z.infer<typeof updateSettingsSchema>,
): Promise<UserNotificationSetting | { error: string }> {
    // This return type might need to become more generic if we update UserPrivate directly
    const userId = await getAuthenticatedUserDid();
    if (!userId) {
        return { error: "User not authenticated." };
    }

    const parseResult = updateSettingsSchema.safeParse(input);
    if (!parseResult.success) {
        return { error: `Invalid input: ${parseResult.error.format()}` };
    }

    const { entityType, entityId, notificationType, isEnabled } = parseResult.data;

    try {
        // Verify permission to change this setting
        const defaultSetting = await DefaultNotificationSettings.findOne({
            entityType,
            notificationType,
        });

        const hasPermission = await checkUserPermissionForNotification(
            userId,
            entityType,
            entityId,
            defaultSetting?.requiredPermission,
        );

        if (!hasPermission) {
            return { error: "You do not have permission to change this setting." };
        }

        const filter = { userId, entityId, entityType, notificationType };
        const updateDoc = {
            $set: { isEnabled, updatedAt: new Date() },
            $setOnInsert: { createdAt: new Date(), userId, entityId, entityType, notificationType },
        };

        const result = await UserNotificationSettings.findOneAndUpdate(filter, updateDoc, {
            upsert: true,
            returnDocument: "after",
        });

        if (!result) {
            // result.value is deprecated, check result itself for newer driver versions or result for older.
            // For MongoDB driver v4+, findOneAndUpdate returns a WithId<TSchema> | null.
            // If upsert happened and it was an insert, result will contain the new document.
            // If it was an update, it will contain the updated document.
            // If no document matched and upsert:false, it's null.
            // Given upsert:true, it should always return a document.
            // However, to be safe, especially if the driver version or exact return type is uncertain:
            return { error: "Failed to update or create notification setting." };
        }
        // @ts-ignore _id is present
        return result as UserNotificationSetting; // This might need adjustment if we return the whole UserPrivate
    } catch (error) {
        console.error("Error updating notification setting:", error);
        return { error: "Failed to update notification setting." };
    }
}

// Schema for updating pause settings
const updatePauseSettingsSchema = z.object({
    pauseType: z.enum(["all", "category"]),
    durationSeconds: z.number().int().min(0).optional(), // 0 means unpause, undefined could mean 'forever' if used with a flag
    isPausedForever: z.boolean().optional(), // For "until I turn it back on"
    categoryKey: z.string().optional(), // e.g., "post", "proposal" - only if pauseType is "category"
});

/**
 * Updates the global or category-specific notification pause settings for the current user.
 */
export async function updateUserPauseSettings(
    input: z.infer<typeof updatePauseSettingsSchema>,
): Promise<{ success: boolean; error?: string; notificationPauseConfig?: UserPrivate["notificationPauseConfig"] }> {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, error: "User not authenticated." };
    }

    const parseResult = updatePauseSettingsSchema.safeParse(input);
    if (!parseResult.success) {
        return { success: false, error: `Invalid input: ${parseResult.error.format()}` };
    }

    const { pauseType, durationSeconds, categoryKey, isPausedForever } = parseResult.data;

    if (pauseType === "category" && !categoryKey) {
        return { success: false, error: "Category key is required for category pause type." };
    }

    try {
        // Fetch user as UserPrivate type to ensure notificationPauseConfig is available
        const user = (await Circles.findOne({ did: userDid, circleType: "user" })) as UserPrivate | null;
        if (!user) {
            return { success: false, error: "User profile not found." };
        }

        let newPauseConfig = user.notificationPauseConfig || { categoryUntil: {} }; // Ensure categoryUntil is initialized
        let untilDate: Date | undefined = undefined;

        if (isPausedForever) {
            // Set a very distant future date for "forever"
            untilDate = new Date("9999-12-31T23:59:59.999Z");
        } else if (durationSeconds !== undefined && durationSeconds > 0) {
            untilDate = new Date(Date.now() + durationSeconds * 1000);
        } else {
            // Unpausing (durationSeconds is 0 or undefined and not isPausedForever)
            untilDate = undefined;
        }

        if (pauseType === "all") {
            newPauseConfig.allUntil = untilDate;
        } else if (pauseType === "category" && categoryKey) {
            if (!newPauseConfig.categoryUntil) {
                newPauseConfig.categoryUntil = {};
            }
            if (untilDate) {
                newPauseConfig.categoryUntil[categoryKey] = untilDate;
            } else {
                delete newPauseConfig.categoryUntil[categoryKey]; // Remove pause for this category
                if (Object.keys(newPauseConfig.categoryUntil).length === 0) {
                    delete newPauseConfig.categoryUntil; // Clean up if no categories are paused
                }
            }
        }

        // Clean up allUntil if it's undefined and categoryUntil is also empty or undefined
        if (
            newPauseConfig.allUntil === undefined &&
            (newPauseConfig.categoryUntil === undefined || Object.keys(newPauseConfig.categoryUntil).length === 0)
        ) {
            // If everything is unpaused, remove the notificationPauseConfig field entirely
            await Circles.updateOne({ _id: user._id }, { $unset: { notificationPauseConfig: "" } });
            return { success: true, notificationPauseConfig: undefined };
        } else {
            await Circles.updateOne({ _id: user._id }, { $set: { notificationPauseConfig: newPauseConfig } });
            return { success: true, notificationPauseConfig: newPauseConfig };
        }
    } catch (error) {
        console.error("Error updating user pause settings:", error);
        return { success: false, error: "Failed to update pause settings." };
    }
}
