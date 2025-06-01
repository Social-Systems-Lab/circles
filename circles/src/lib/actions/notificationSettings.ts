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
    notificationTypeValues, // Import the actual array of values
    GroupedNotificationSettings, // Import the type from models
    // entityTypeSchema, // No longer need schema if using values directly
} from "@/models/models"; // Adjusted path
import { getAuthenticatedUserDid } from "@/lib/auth/auth"; // Corrected path and function
import { UserNotificationSettings, DefaultNotificationSettings } from "../data/db"; // Import actual DB collections
// import { checkPermission } from "@/lib/permissions"; // Placeholder for permission checking utility

import { Circles, Members } from "../data/db"; // Import Circle and Member collections
import { ObjectId } from "mongodb";

// Placeholder for permission checking
// This would check if a user has the 'requiredPermission' for a given entity and notification type
export const checkUserPermissionForNotification = async (
    // Added export
    userId: string, // This is user DID
    entityType: EntityType,
    entityId: string, // ID of the entity instance (e.g. circleId, postId)
    requiredPermission?: string,
): Promise<boolean> => {
    if (!requiredPermission) return true; // No specific permission required, always allow configuration

    console.log(`Checking permission '${requiredPermission}' for user ${userId} on ${entityType}:${entityId}`);

    // Example for CIRCLE entity type
    if (entityType === "CIRCLE") {
        const circleId = entityId;
        try {
            const circle = await Circles.findOne({ _id: new ObjectId(circleId) });
            if (!circle) {
                console.warn(`Circle not found: ${circleId}`);
                return false;
            }

            const member = await Members.findOne({ userDid: userId, circleId: circleId });
            if (!member) {
                console.warn(`User ${userId} is not a member of circle ${circleId}`);
                return false;
            }

            const memberUserGroups = member.userGroups || [];

            // This is a simplified check. A real implementation would:
            // 1. Map `requiredPermission` (e.g., "CAN_APPROVE_REQUESTS") to specific feature handles or access levels.
            // 2. Check circle.accessRules against the user's groups for that feature/module.
            // 3. Check circle.userGroups definitions for accessLevel associated with the user's groups.
            // For now, let's assume if a user is an 'admin' or 'moderator' in the circle, they have most permissions.
            // This requires `userGroupSchema` in `circle.userGroups` to have a `handle` (e.g., 'admins', 'moderators').

            const isAdminOrModerator = memberUserGroups.some((groupHandle) => {
                const groupDefinition = circle.userGroups?.find((ug) => ug.handle === groupHandle);
                // Assuming 'admins' or 'moderators' handles imply high privileges.
                // Or, a more granular check based on `requiredPermission` string mapping to specific access rules.
                return groupDefinition?.handle === "admins" || groupDefinition?.handle === "moderators";
            });

            if (isAdminOrModerator) return true;

            // Add more specific checks based on `requiredPermission` string if needed.
            // e.g., if (requiredPermission === "SOME_SPECIFIC_ACTION_PERMISSION") { ... }

            console.log(
                `User ${userId} does not have required permission '${requiredPermission}' for circle ${circleId}`,
            );
            return false;
        } catch (error) {
            console.error("Error checking circle permission:", error);
            return false;
        }
    } else if (entityType === "USER") {
        // For entityType USER, the entityId would be the target user's DID.
        // Permissions here usually mean "is the requesting user the same as the target user?"
        return userId === entityId;
    }
    // TODO: Implement permission checks for other entity types (POST, COMMENT, TASK, etc.)
    // This might involve checking ownership (e.g., post author) or roles within a parent entity (e.g., circle).
    console.warn(`Permission check not fully implemented for entityType: ${entityType}. Defaulting to true for now.`);
    return true; // Default to true for other entity types until implemented
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

        // Process default settings first
        for (const defaultSetting of defaultSettingsList) {
            // This part is tricky without knowing all entity IDs the user interacts with.
            // For a generic "all settings" view, we might only show defaults for 'USER' entityType
            // or rely on the client to request settings for specific entities it knows about.
            // For now, let's assume we're preparing a structure that can be queried for specific entities.

            // Initialize if not present
            if (!combinedSettings[defaultSetting.entityType]) {
                // @ts-ignore
                combinedSettings[defaultSetting.entityType] = {};
            }
            // How to handle entityId for defaults? Defaults are not entity-instance-specific.
            // One approach: store defaults under a special '_DEFAULT_' entityId or apply them when a specific entity is queried.
            // For now, this function will return a structure that includes defaults, and client/consuming functions
            // will need to merge them appropriately for specific entity instances.
            // Let's assume for now that defaults are primarily for non-instance specific things or as a base.
        }

        // Create a map for quick lookup of user settings
        const userSettingsMap = new Map<string, UserNotificationSetting>();
        for (const us of userSettingsList) {
            userSettingsMap.set(`${us.entityType}:${us.entityId}:${us.notificationType}`, us);
        }

        // Iterate through all possible notification types and entity types to build the full structure
        // This requires knowing all NotificationType values and EntityType values
        const allEntityTypes = entityTypeSchema.options; // Corrected: Use .options for Zod enums
        const allNotificationTypes = notificationTypeValues; // Use the imported array

        for (const entityType of allEntityTypes) {
            if (!combinedSettings[entityType]) {
                combinedSettings[entityType] = {} as GroupedNotificationSettings[EntityType];
            }
            // We need a list of relevant entity IDs for the user for each entity type.
            // This is the complex part for a "global" settings fetch.
            // For this example, let's assume we only populate for entities where user has specific settings.
            // A more robust solution might involve `getPrivateUser` providing relevant entity IDs.
        }

        for (const userSetting of userSettingsList) {
            const { entityType, entityId, notificationType, isEnabled } = userSetting;
            const defaultSetting = defaultSettingsList.find(
                (ds) => ds.entityType === entityType && ds.notificationType === notificationType,
            );

            const hasPermission = await checkUserPermissionForNotification(
                userId,
                entityType,
                entityId,
                defaultSetting?.requiredPermission,
            );

            if (!combinedSettings[entityType]) {
                combinedSettings[entityType] = {} as GroupedNotificationSettings[EntityType];
            }
            if (!combinedSettings[entityType][entityId]) {
                combinedSettings[entityType][entityId] = {} as Record<
                    NotificationType,
                    { isEnabled: boolean; isConfigurable: boolean }
                >;
            }

            const entitySettings = combinedSettings[entityType][entityId];
            entitySettings[notificationType] = {
                // No implicit any here
                isEnabled: isEnabled,
                isConfigurable: hasPermission, // User can only configure if they have permission
            };
        }

        // Now, fill in any missing settings with defaults for entities the user *has* interacted with
        // (i.e., has at least one userSetting for)
        for (const entityType of allEntityTypes) {
            if (combinedSettings[entityType]) {
                for (const entityId in combinedSettings[entityType]) {
                    const currentEntitySettings = combinedSettings[entityType][entityId];
                    for (const notificationType of allNotificationTypes) {
                        if (!currentEntitySettings[notificationType]) {
                            const defaultSetting = defaultSettingsList.find(
                                (ds) => ds.entityType === entityType && ds.notificationType === notificationType,
                            );
                            if (defaultSetting) {
                                const hasPermission = await checkUserPermissionForNotification(
                                    userId,
                                    entityType,
                                    entityId, // entityId might be less relevant for a purely default check if it's a global default
                                    defaultSetting.requiredPermission,
                                );
                                if (hasPermission) {
                                    // Only show default if user would have permission
                                    currentEntitySettings[notificationType] = {
                                        // No implicit any
                                        isEnabled: defaultSetting.defaultIsEnabled,
                                        isConfigurable: true, // If shown, it's configurable
                                    };
                                }
                            }
                        }
                    }
                }
            }
        }

        return combinedSettings;
    } catch (error) {
        console.error("Error fetching notification settings:", error);
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
        return result as UserNotificationSetting;
    } catch (error) {
        console.error("Error updating notification setting:", error);
        return { error: "Failed to update notification setting." };
    }
}
