"use server";

import { DefaultNotificationSettings } from "../data/db";
import {
    DefaultNotificationSetting,
    entityTypeSchema,
    notificationTypeValues,
    EntityType,
    NotificationType,
} from "@/models/models";

// Define the default settings configuration
// This array should be comprehensive for all relevant entity types and notification types.
const defaultSettingsConfig: Omit<DefaultNotificationSetting, "_id" | "createdAt" | "updatedAt">[] = [
    // Circle specific defaults
    {
        entityType: "CIRCLE",
        notificationType: "follow_request",
        defaultIsEnabled: true,
        requiredPermission: "CAN_APPROVE_MEMBERSHIP",
    }, // e.g. only admins/mods
    { entityType: "CIRCLE", notificationType: "new_follower", defaultIsEnabled: true }, // All members of a circle might want this
    { entityType: "CIRCLE", notificationType: "follow_accepted", defaultIsEnabled: true }, // User specific, but default is on

    // Post specific defaults
    { entityType: "POST", notificationType: "post_comment", defaultIsEnabled: true }, // Post author
    { entityType: "POST", notificationType: "post_like", defaultIsEnabled: true }, // Post author
    { entityType: "POST", notificationType: "post_mention", defaultIsEnabled: true }, // Mentioned user

    // Comment specific defaults
    { entityType: "COMMENT", notificationType: "comment_reply", defaultIsEnabled: true }, // Comment author
    { entityType: "COMMENT", notificationType: "comment_like", defaultIsEnabled: true }, // Comment author
    { entityType: "COMMENT", notificationType: "comment_mention", defaultIsEnabled: true }, // Mentioned user

    // Proposal specific defaults
    {
        entityType: "PROPOSAL",
        notificationType: "proposal_submitted_for_review",
        defaultIsEnabled: true,
        requiredPermission: "CAN_REVIEW_PROPOSALS",
    },
    {
        entityType: "PROPOSAL",
        notificationType: "proposal_moved_to_voting",
        defaultIsEnabled: true,
        requiredPermission: "CAN_VOTE_PROPOSALS",
    },
    { entityType: "PROPOSAL", notificationType: "proposal_approved_for_voting", defaultIsEnabled: true }, // Author
    { entityType: "PROPOSAL", notificationType: "proposal_resolved", defaultIsEnabled: true }, // Author
    {
        entityType: "PROPOSAL",
        notificationType: "proposal_resolved_voter",
        defaultIsEnabled: true,
        requiredPermission: "CAN_VOTE_PROPOSALS",
    },
    { entityType: "PROPOSAL", notificationType: "proposal_vote", defaultIsEnabled: true }, // Author

    // Issue specific defaults
    {
        entityType: "ISSUE",
        notificationType: "issue_submitted_for_review",
        defaultIsEnabled: true,
        requiredPermission: "CAN_REVIEW_ISSUES",
    },
    { entityType: "ISSUE", notificationType: "issue_approved", defaultIsEnabled: true }, // Author
    { entityType: "ISSUE", notificationType: "issue_assigned", defaultIsEnabled: true }, // Assignee
    { entityType: "ISSUE", notificationType: "issue_status_changed", defaultIsEnabled: true }, // Author/Assignee

    // Task specific defaults
    {
        entityType: "TASK",
        notificationType: "task_submitted_for_review",
        defaultIsEnabled: true,
        requiredPermission: "CAN_REVIEW_TASKS",
    },
    { entityType: "TASK", notificationType: "task_approved", defaultIsEnabled: true }, // Author
    { entityType: "TASK", notificationType: "task_assigned", defaultIsEnabled: true }, // Assignee
    { entityType: "TASK", notificationType: "task_status_changed", defaultIsEnabled: true }, // Author/Assignee

    // Goal specific defaults
    {
        entityType: "GOAL",
        notificationType: "goal_submitted_for_review",
        defaultIsEnabled: true,
        requiredPermission: "CAN_REVIEW_GOALS",
    },
    { entityType: "GOAL", notificationType: "goal_approved", defaultIsEnabled: true }, // Author
    { entityType: "GOAL", notificationType: "goal_status_changed", defaultIsEnabled: true }, // Author

    // User specific (non-entity instance specific, or global defaults for certain actions)
    // Example: if ranking_stale_reminder is a user-level notification not tied to a specific circle.
    // { entityType: "USER", notificationType: "ranking_stale_reminder", defaultIsEnabled: true },
    // { entityType: "USER", notificationType: "ranking_grace_period_ended", defaultIsEnabled: true },
];

export async function seedDefaultNotificationSettings(): Promise<{ success: boolean; message: string; count: number }> {
    let seededCount = 0;
    try {
        for (const setting of defaultSettingsConfig) {
            const filter = {
                entityType: setting.entityType,
                notificationType: setting.notificationType,
            };
            const update = {
                $setOnInsert: {
                    entityType: setting.entityType,
                    notificationType: setting.notificationType,
                    defaultIsEnabled: setting.defaultIsEnabled,
                    requiredPermission: setting.requiredPermission,
                },
            };
            const result = await DefaultNotificationSettings.updateOne(filter, update, { upsert: true });
            if (result.upsertedCount > 0) {
                seededCount++;
            }
        }
        const message = `Default notification settings seeded. ${seededCount} new settings added. Total configured: ${defaultSettingsConfig.length}.`;
        console.log(message);
        return { success: true, message, count: seededCount };
    } catch (error) {
        const errorMessage = `Error seeding default notification settings: ${error instanceof Error ? error.message : String(error)}`;
        console.error(errorMessage);
        return { success: false, message: errorMessage, count: 0 };
    }
}

// Example of how to add more specific defaults if needed, or ensure all notification types are covered for each entity type.
// This is more for completeness check during development.
function checkCoverage() {
    const allEntityTypes = entityTypeSchema.options;
    allEntityTypes.forEach((et) => {
        notificationTypeValues.forEach((nt) => {
            const exists = defaultSettingsConfig.some((s) => s.entityType === et && s.notificationType === nt);
            if (!exists) {
                // This logic is just for development to identify missing defaults.
                // You might decide not all notification types apply to all entity types.
                // console.warn(`Missing default setting for EntityType: ${et}, NotificationType: ${nt}`);
            }
        });
    });
}
// checkCoverage(); // Call during development if needed
