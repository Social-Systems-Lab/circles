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
    // entityTypeSchema, // No longer need schema if using values directly
} from "@/models/models"; // Adjusted path
import { getAuthenticatedUserDid } from "@/lib/auth/auth"; // Corrected path and function
// import { db } from "@/lib/data/db"; // Placeholder for database utility
// import { checkPermission } from "@/lib/permissions"; // Placeholder for permission checking utility

// Placeholder for database interaction functions
const db = {
    userNotificationSetting: {
        findMany: async (query: any): Promise<UserNotificationSetting[]> => {
            console.log("DB Query (UserNotificationSetting - findMany):", query);
            return [];
        },
        upsert: async (query: any): Promise<UserNotificationSetting> => {
            console.log("DB Query (UserNotificationSetting - upsert):", query.where, query.update);
            // @ts-ignore
            return { ...query.create, _id: "new_setting_id", createdAt: new Date(), updatedAt: new Date() };
        },
    },
    defaultNotificationSetting: {
        findMany: async (query: any): Promise<DefaultNotificationSetting[]> => {
            console.log("DB Query (DefaultNotificationSetting - findMany):", query);
            return [];
        },
    },
};

// Placeholder for permission checking
// This would check if a user has the 'requiredPermission' for a given entity and notification type
const checkUserPermissionForNotification = async (
    userId: string,
    entityType: EntityType,
    entityId: string,
    requiredPermission?: string,
): Promise<boolean> => {
    if (!requiredPermission) return true; // No specific permission required
    console.log(`Checking permission '${requiredPermission}' for user ${userId} on ${entityType}:${entityId}`);
    // Actual permission logic would go here, e.g., querying user groups, circle access rules etc.
    // For now, let's assume admin users have all permissions
    // const user = await db.user.findUnique({ where: { id: userId } });
    // return user?.isAdmin || false;
    return true; // Placeholder: allow all for now
};

export type GroupedNotificationSettings = Record<
    EntityType,
    Record<string, Record<NotificationType, { isEnabled: boolean; isConfigurable: boolean }>>
>;

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
            db.userNotificationSetting.findMany({ where: { userId } }),
            db.defaultNotificationSetting.findMany({}),
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
        const defaultSetting = await db.defaultNotificationSetting.findMany({
            // Should be findFirst/findUnique
            where: { entityType, notificationType },
        });

        const hasPermission = await checkUserPermissionForNotification(
            userId,
            entityType,
            entityId,
            defaultSetting[0]?.requiredPermission, // Assuming findMany returns array, take first if exists
        );

        if (!hasPermission) {
            return { error: "You do not have permission to change this setting." };
        }

        const setting = await db.userNotificationSetting.upsert({
            where: {
                userId_entityId_entityType_notificationType: {
                    // Prisma-like unique constraint name
                    userId,
                    entityId,
                    entityType,
                    notificationType,
                },
            },
            update: { isEnabled, updatedAt: new Date() },
            create: {
                userId,
                entityId,
                entityType,
                notificationType,
                isEnabled,
                createdAt: new Date(),
                updatedAt: new Date(),
            },
        });
        return setting;
    } catch (error) {
        console.error("Error updating notification setting:", error);
        return { error: "Failed to update notification setting." };
    }
}
