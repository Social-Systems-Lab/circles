// src/lib/data/ranking.ts - Generic Ranking Logic
import { ObjectId } from "mongodb";
import { AggregateRanks } from "./db"; // Import db instance
import { RankedLists, Circles } from "./db";
import { getMemberIdsByUserGroup } from "./member";
import { isAuthorized } from "../auth/auth";
import { features } from "./constants"; // Assuming features constant is defined here or imported
import { getActiveTasksByCircleId } from "./task";
import { getActiveGoalsByCircleId } from "./goal";
import { getActiveIssuesByCircleId } from "./issue";
import { getActiveProposalsByCircleId } from "./proposal";
// Removed incorrect logger import, will use console.*
import { sendNotifications } from "./matrix"; // Import the actual sending function
import { getUserPrivate } from "./user"; // To fetch recipient details

// --- Constants ---

// How many days after a list becomes stale does the grace period end?
export const RANKING_STALENESS_GRACE_PERIOD_DAYS = 7;
// How many hours after a list becomes stale should the first reminder be sent?
export const RANKING_STALE_REMINDER_HOURS = 48;

// --- Types & Interfaces ---

export type ItemType = "tasks" | "goals" | "issues" | "proposals";

// Interface for items that can be ranked (must have _id and createdAt)
export interface RankableItem {
    _id?: string | ObjectId; // Allow both string and ObjectId initially
    createdAt?: Date | string; // Allow both Date and string initially
    // Add other common fields if necessary, but keep minimal for genericity
}

// Context needed for calculating or retrieving rankings
export interface RankingContext {
    entityId: string; // e.g., circleId
    itemType: ItemType;
    userDid?: string; // The user requesting the ranking (for permission checks)
    filterUserGroupHandle?: string; // Optional group filtering
}

// Information about a list's staleness status
export interface StaleListInfo {
    listId: string;
    userId: string;
    isStale: boolean; // Currently doesn't match active items
    isPastGracePeriod: boolean; // becameStaleAt + grace period < now
    becameStaleAt: Date | null; // When it first became stale
    unrankedItemCount: number; // How many active items are missing from the list
}

// Result from the core calculation logic
export interface CalculateRankingResult {
    rankMap: Map<string, number>;
    totalRankers: number; // Number of lists contributing points
    activeItemIds: Set<string>; // IDs of items included in the ranking
    staleListsInfo: StaleListInfo[]; // Info about lists that are stale or past grace period
}

// Structure for storing cached aggregate ranks
export interface AggregateRank {
    _id?: ObjectId;
    entityId: string;
    itemType: ItemType;
    filterUserGroupHandle?: string | null; // Use null for no filter
    rankMap: Record<string, number>; // Store Map as Record<string, number>
    totalRankers: number;
    activeItemIds: string[]; // Store Set as string[]
    updatedAt: Date;
}

// --- Database Collection ---

// Ensure indexes for efficient querying of cache
AggregateRanks?.createIndex({ entityId: 1, itemType: 1, filterUserGroupHandle: 1 }, { unique: true });
AggregateRanks?.createIndex({ updatedAt: 1 }); // For potential TTL or cleanup

// --- Helper Functions ---

/**
 * Fetches active, rankable items based on the item type.
 * @param context RankingContext containing entityId and itemType
 * @returns Promise<RankableItem[]>
 */
async function getActiveItems(context: RankingContext): Promise<RankableItem[]> {
    const { entityId, itemType } = context;
    let items: RankableItem[] = [];

    try {
        switch (itemType) {
            case "tasks":
                items = await getActiveTasksByCircleId(entityId);
                break;
            case "goals":
                items = await getActiveGoalsByCircleId(entityId);
                break;
            case "issues":
                items = await getActiveIssuesByCircleId(entityId);
                break;
            case "proposals":
                items = await getActiveProposalsByCircleId(entityId);
                break;
            default:
                console.warn(`Unsupported itemType for getActiveItems: ${itemType}`);
                return [];
        }
        // Ensure _id is string and createdAt is Date
        return items
            .map((item) => ({
                ...item,
                _id: item._id ? item._id.toString() : undefined,
                createdAt: item.createdAt ? new Date(item.createdAt) : undefined,
            }))
            .filter((item) => item._id && item.createdAt) as RankableItem[]; // Filter out items missing essential fields
    } catch (error) {
        console.error(`Error fetching active items for ${itemType} in ${entityId}:`, error);
        return []; // Return empty on error
    }
}

// --- Core Calculation Logic ---

/**
 * Calculates the aggregate ranking based on Borda count, handling staleness and grace periods.
 * This function DOES NOT modify the database (e.g., setting becameStaleAt).
 * @param context RankingContext
 * @returns Promise<CalculateRankingResult>
 */
export const calculateAggregateRanking = async (context: RankingContext): Promise<CalculateRankingResult> => {
    const { entityId, itemType, filterUserGroupHandle } = context;
    const now = new Date();
    const defaultResult: CalculateRankingResult = {
        rankMap: new Map(),
        totalRankers: 0,
        activeItemIds: new Set(),
        staleListsInfo: [],
    };

    try {
        // 1. Get active items
        const activeItems = await getActiveItems(context);
        const activeItemIds = new Set(activeItems.map((item) => item._id!.toString())); // Assert _id is string
        const N = activeItemIds.size;

        if (N === 0) {
            return defaultResult; // No active items to rank
        }

        // 2. Fetch all potentially relevant ranked lists for the entity and type
        const allRankedLists = await RankedLists.find({
            entityId: entityId,
            type: itemType,
        }).toArray();

        if (allRankedLists.length === 0) {
            return { ...defaultResult, activeItemIds }; // No lists found
        }

        // 3. Filter lists based on user permissions and group filter
        const userIdsToCheck = new Set<string>(allRankedLists.map((list) => list.userId));
        const users = await Circles.find({ _id: { $in: Array.from(userIdsToCheck).map((id) => new ObjectId(id)) } })
            .project<{ _id: ObjectId; did?: string }>({ _id: 1, did: 1 })
            .toArray();
        const userMap = new Map(users.map((u) => [u._id.toString(), u.did]));

        let groupMemberIds: Set<string> | null = null;
        if (filterUserGroupHandle) {
            try {
                // Assuming getMemberIdsByUserGroup takes circleId (entityId)
                groupMemberIds = new Set(await getMemberIdsByUserGroup(entityId, filterUserGroupHandle));
            } catch (err) {
                console.error(`Error getting members for group ${filterUserGroupHandle} in ${entityId}:`, err);
                groupMemberIds = new Set(); // Treat as empty if error
            }
        }

        const permissionChecks = Array.from(userIdsToCheck).map(async (userId) => {
            const userDid = userMap.get(userId);
            if (!userDid) return false; // User not found
            if (groupMemberIds && !groupMemberIds.has(userId)) return false; // Doesn't belong to filtered group

            // Check if user has permission to rank this itemType in this entity
            // Assuming a feature structure like features.tasks.rank, features.goals.rank etc.
            const rankFeature = features[itemType]?.rank;
            if (!rankFeature) {
                console.warn(`No rank feature defined for itemType: ${itemType}`);
                return false; // Cannot rank if feature doesn't exist
            }
            const hasPermission = await isAuthorized(userDid, entityId, rankFeature);
            return hasPermission ? userId : false;
        });

        const permissionResults = await Promise.all(permissionChecks);
        const permittedUserIds = new Set(permissionResults.filter((result): result is string => result !== false));

        const listsToProcess = allRankedLists.filter((list) => permittedUserIds.has(list.userId));
        if (listsToProcess.length === 0) {
            return { ...defaultResult, activeItemIds }; // No permitted lists
        }

        // 4. Get item creation dates for tie-breaking
        const itemCreationDates = new Map<string, Date>();
        activeItems.forEach((item) => {
            if (item._id && item.createdAt) {
                itemCreationDates.set(item._id.toString(), item.createdAt as Date); // Assert createdAt is Date
            }
        });

        // 5. Aggregate scores using Borda Count & Determine Staleness Info
        const itemScores = new Map<string, number>();
        let contributingRankers = 0;
        const staleListsInfo: StaleListInfo[] = [];

        for (const list of listsToProcess) {
            const userRankedIds = new Set(list.list);
            const rankedActiveItemsCount = list.list.filter((id) => activeItemIds.has(id)).length;
            const isComplete = rankedActiveItemsCount === N && list.list.length === N; // Check if all *active* items are ranked and no extra items exist
            const unrankedItemCount = N - rankedActiveItemsCount;
            const isCurrentlyStale = !isComplete; // Stale if not complete w.r.t active items

            const becameStaleAt = list.becameStaleAt ? new Date(list.becameStaleAt) : null;
            let listContributes = false;
            let isPastGracePeriod = false;

            if (isComplete) {
                // --- List is Complete and Fresh ---
                listContributes = true;
                list.list.forEach((itemId, index) => {
                    const points = N - index;
                    itemScores.set(itemId, (itemScores.get(itemId) || 0) + points);
                });
                // Note: We don't unset becameStaleAt here, that's for the periodic job
            } else {
                // --- List is Incomplete (Stale) ---
                if (!becameStaleAt) {
                    // --- First time detected as stale (within grace period) ---
                    listContributes = true;
                    // Assign points using average for unranked
                    const K = rankedActiveItemsCount;
                    const M = N - K;
                    const avgPoints = M > 0 ? (N - K + 1) / 2 : 0;

                    list.list.forEach((itemId, index) => {
                        if (activeItemIds.has(itemId)) {
                            // Only score active items
                            const points = N - index; // Points based on original position
                            itemScores.set(itemId, (itemScores.get(itemId) || 0) + points);
                        }
                    });
                    activeItemIds.forEach((itemId) => {
                        if (!userRankedIds.has(itemId)) {
                            itemScores.set(itemId, (itemScores.get(itemId) || 0) + avgPoints);
                        }
                    });
                    // Note: We don't set becameStaleAt here, that's for the periodic job
                } else {
                    // --- Already stale: Check grace period ---
                    const gracePeriodEnd = new Date(becameStaleAt);
                    gracePeriodEnd.setDate(gracePeriodEnd.getDate() + RANKING_STALENESS_GRACE_PERIOD_DAYS);
                    isPastGracePeriod = now > gracePeriodEnd;

                    if (!isPastGracePeriod) {
                        // --- Within Grace Period ---
                        listContributes = true;
                        // Assign points (same logic as first time stale)
                        const K = rankedActiveItemsCount;
                        const M = N - K;
                        const avgPoints = M > 0 ? (N - K + 1) / 2 : 0;

                        list.list.forEach((itemId, index) => {
                            if (activeItemIds.has(itemId)) {
                                const points = N - index;
                                itemScores.set(itemId, (itemScores.get(itemId) || 0) + points);
                            }
                        });
                        activeItemIds.forEach((itemId) => {
                            if (!userRankedIds.has(itemId)) {
                                itemScores.set(itemId, (itemScores.get(itemId) || 0) + avgPoints);
                            }
                        });
                    } else {
                        // --- Grace Period Expired ---
                        listContributes = false; // Does not contribute points
                    }
                }
            }

            if (listContributes) {
                contributingRankers++;
            }

            // Record staleness info regardless of contribution status
            if (isCurrentlyStale) {
                staleListsInfo.push({
                    listId: list._id.toString(),
                    userId: list.userId,
                    isStale: true,
                    isPastGracePeriod: isPastGracePeriod, // Calculated above
                    becameStaleAt: becameStaleAt,
                    unrankedItemCount: unrankedItemCount,
                });
            } else if (becameStaleAt) {
                // If it's complete now but *was* stale, record it so the periodic job can unset becameStaleAt
                staleListsInfo.push({
                    listId: list._id.toString(),
                    userId: list.userId,
                    isStale: false, // It's not stale *now*
                    isPastGracePeriod: false,
                    becameStaleAt: becameStaleAt, // Keep the date it *was* stale
                    unrankedItemCount: 0,
                });
            }
        }

        // 6. Convert scores to ranks with tie-breaking
        const rankedResults = Array.from(itemScores.entries())
            .map(([itemId, score]) => ({
                itemId,
                score,
                createdAt: itemCreationDates.get(itemId) || new Date(0), // Use epoch if not found
            }))
            .sort((a, b) => {
                if (b.score !== a.score) return b.score - a.score; // Score descending
                if (a.createdAt && b.createdAt && !isNaN(a.createdAt.getTime()) && !isNaN(b.createdAt.getTime())) {
                    return a.createdAt.getTime() - b.createdAt.getTime(); // Creation date ascending (older first)
                }
                return a.itemId.localeCompare(b.itemId); // Fallback: ID ascending
            });

        const rankMap = new Map<string, number>();
        rankedResults.forEach((item, index) => {
            rankMap.set(item.itemId, index + 1); // Rank 1, 2, 3...
        });

        return {
            rankMap,
            totalRankers: contributingRankers,
            activeItemIds,
            staleListsInfo,
        };
    } catch (error) {
        console.error(`Error calculating ${itemType} ranking for ${entityId}:`, error);
        return defaultResult; // Return default on error
    }
};

// --- Caching Functions ---

/**
 * Updates the cached aggregate ranking for a given context.
 * @param context RankingContext
 * @returns Promise<boolean> indicating success
 */
export const updateAggregateRankCache = async (context: RankingContext): Promise<boolean> => {
    const { entityId, itemType, filterUserGroupHandle } = context;
    console.debug(
        // Replaced log.debug with console.debug
        `Updating aggregate rank cache for ${itemType} in ${entityId} (group: ${filterUserGroupHandle || "all"})`,
    );

    try {
        const calculationResult = await calculateAggregateRanking(context);

        const cacheEntry: AggregateRank = {
            entityId: entityId,
            itemType: itemType,
            filterUserGroupHandle: filterUserGroupHandle || null, // Store undefined as null
            rankMap: Object.fromEntries(calculationResult.rankMap), // Convert Map to object
            totalRankers: calculationResult.totalRankers,
            activeItemIds: Array.from(calculationResult.activeItemIds), // Convert Set to array
            updatedAt: new Date(),
        };

        // Use upsert to insert or update the cache entry
        const result = await AggregateRanks.updateOne(
            {
                entityId: cacheEntry.entityId,
                itemType: cacheEntry.itemType,
                filterUserGroupHandle: cacheEntry.filterUserGroupHandle,
            },
            { $set: cacheEntry },
            { upsert: true },
        );

        console.info(
            // Replaced log.info with console.info
            `Aggregate rank cache updated for ${itemType} in ${entityId} (group: ${filterUserGroupHandle || "all"}). Matched: ${result.matchedCount}, Modified: ${result.modifiedCount}, Upserted: ${result.upsertedCount}`,
        );
        return result.acknowledged;
    } catch (error) {
        console.error(
            `Error updating aggregate rank cache for ${itemType} in ${entityId} (group: ${filterUserGroupHandle || "all"}):`,
            error,
        );
        return false;
    }
};

/**
 * Retrieves the aggregate ranking, using cache if available and valid, otherwise calculates and caches it.
 * @param context RankingContext
 * @param maxCacheAgeSeconds Maximum age of cache entry in seconds (e.g., 3600 for 1 hour). If 0, always recalculate.
 * @returns Promise<CalculateRankingResult>
 */
export const getAggregateRanking = async (
    context: RankingContext,
    maxCacheAgeSeconds: number = 3600, // Default cache age: 1 hour
): Promise<CalculateRankingResult> => {
    const { entityId, itemType, filterUserGroupHandle } = context;
    const cacheKey = {
        entityId,
        itemType,
        filterUserGroupHandle: filterUserGroupHandle || null,
    };

    console.trace(
        `Getting aggregate ranking for ${itemType} in ${entityId} (group: ${filterUserGroupHandle || "all"})`,
    ); // Replaced log.trace with console.trace

    // If maxCacheAge is 0, skip cache check and recalculate
    if (maxCacheAgeSeconds > 0) {
        try {
            const cachedRank = await AggregateRanks.findOne(cacheKey);
            if (cachedRank) {
                const cacheAge = (new Date().getTime() - cachedRank.updatedAt.getTime()) / 1000;
                if (cacheAge <= maxCacheAgeSeconds) {
                    console.debug(
                        `Cache hit for ${itemType} in ${entityId} (group: ${filterUserGroupHandle || "all"})`,
                    ); // Replaced log.debug with console.debug
                    // Convert cached data back to expected format
                    return {
                        rankMap: new Map(Object.entries(cachedRank.rankMap)),
                        totalRankers: cachedRank.totalRankers,
                        activeItemIds: new Set(cachedRank.activeItemIds),
                        staleListsInfo: [], // Cache doesn't store live staleness info
                    };
                } else {
                    console.debug(
                        `Cache stale for ${itemType} in ${entityId} (group: ${filterUserGroupHandle || "all"})`,
                    ); // Replaced log.debug with console.debug
                }
            } else {
                console.debug(`Cache miss for ${itemType} in ${entityId} (group: ${filterUserGroupHandle || "all"})`); // Replaced log.debug with console.debug
            }
        } catch (error) {
            console.error(`Error reading aggregate rank cache for ${itemType} in ${entityId}:`, error);
            // Proceed to calculate if cache read fails
        }
    } else {
        console.debug(`Cache disabled (maxCacheAgeSeconds=0), recalculating for ${itemType} in ${entityId}`); // Replaced log.debug with console.debug
    }

    // Cache miss, stale, disabled, or error: Calculate and update cache
    try {
        await updateAggregateRankCache(context);
        // Fetch the newly cached data to return it (ensures consistency)
        const freshCache = await AggregateRanks.findOne(cacheKey);
        if (freshCache) {
            return {
                rankMap: new Map(Object.entries(freshCache.rankMap)),
                totalRankers: freshCache.totalRankers,
                activeItemIds: new Set(freshCache.activeItemIds),
                staleListsInfo: [], // Cache doesn't store live staleness info
            };
        } else {
            // Should not happen if update succeeded, but handle defensively
            console.error(`Failed to retrieve cache immediately after update for ${itemType} in ${entityId}`); // Replaced log.error with console.error
            // Fallback to direct calculation result (without staleness info from cache perspective)
            const directResult = await calculateAggregateRanking(context);
            return { ...directResult, staleListsInfo: [] }; // Return calculated but without stale info emphasis
        }
    } catch (error) {
        console.error(`Error during recalculation/caching for ${itemType} in ${entityId}:`, error);
        // Return default empty result on critical error during recalculation
        return {
            rankMap: new Map(),
            totalRankers: 0,
            activeItemIds: new Set(),
            staleListsInfo: [],
        };
    }
};

// --- Periodic Processing ---
// Removed import for createNotification
// Imports for sendNotifications, getUserPrivate, UserPrivate, getCircleById were added previously

/**
 * Iterates through circles and item types to process rank list staleness,
 * update list statuses, and send notifications.
 * Intended to be called by a scheduler (e.g., cron job via API route).
 */
export const processRankingsPeriodically = async () => {
    console.log("Starting periodic ranking processing...");
    const now = new Date();
    const itemTypesToProcess: ItemType[] = ["tasks", "goals", "issues", "proposals"]; // Add other types as needed

    try {
        // 1. Find all circles that might have rankings (e.g., based on enabled modules)
        //    For simplicity now, let's process all circles. A more optimized approach
        //    might filter circles based on whether they have ranking-enabled modules.
        const circles = await Circles.find({ circleType: { $ne: "user" } }) // Exclude user circles
            .project<{ _id: ObjectId; name: string; handle: string; enabledModules?: string[] }>({
                _id: 1,
                name: 1,
                handle: 1,
                enabledModules: 1,
            })
            .toArray();

        console.log(`Found ${circles.length} circles to process.`);

        // 2. Iterate through each circle and item type
        for (const circle of circles) {
            const circleId = circle._id.toString();
            const circleName = circle.name || circle.handle || circleId;

            for (const itemType of itemTypesToProcess) {
                // Check if the module corresponding to the itemType is enabled for the circle
                // (Assuming module handles match item types: 'tasks', 'goals', etc.)
                if (!circle.enabledModules?.includes(itemType)) {
                    // console.trace(`Skipping ${itemType} for circle ${circleId} - module not enabled.`);
                    continue;
                }

                console.debug(`Processing ${itemType} rankings for circle ${circleId} (${circleName})...`);

                try {
                    // 3. Fetch all ranked lists for this circle/type
                    const rankedLists = await RankedLists.find({
                        entityId: circleId,
                        type: itemType,
                    }).toArray();

                    if (rankedLists.length === 0) {
                        console.debug(`No ranked lists found for ${itemType} in circle ${circleId}.`);
                        continue;
                    }

                    // 4. Fetch active items for this circle/type
                    const activeItems = await getActiveItems({ entityId: circleId, itemType });
                    const activeItemIds = new Set(activeItems.map((item) => item._id!.toString()));
                    const N = activeItemIds.size;

                    console.debug(`Found ${N} active ${itemType} items for circle ${circleId}.`);

                    // 5. Process each ranked list
                    const updatePromises: Promise<any>[] = [];
                    const notificationPromises: Promise<any>[] = [];

                    for (const list of rankedLists) {
                        const listId = list._id;
                        const userId = list.userId; // User's _id (string)
                        const userRankedIds = new Set(list.list);
                        const rankedActiveItemsCount = list.list.filter((id) => activeItemIds.has(id)).length;
                        const isComplete = rankedActiveItemsCount === N && list.list.length === N;
                        const unrankedItemCount = N - rankedActiveItemsCount;
                        const isCurrentlyStale = !isComplete;

                        const becameStaleAt = list.becameStaleAt ? new Date(list.becameStaleAt) : null;
                        const lastStaleReminderSentAt = list.lastStaleReminderSentAt
                            ? new Date(list.lastStaleReminderSentAt)
                            : null;
                        const lastGracePeriodEndedSentAt = list.lastGracePeriodEndedSentAt
                            ? new Date(list.lastGracePeriodEndedSentAt)
                            : null;

                        const updates: any = {};
                        const unsets: any = {};

                        if (isCurrentlyStale) {
                            // --- List is currently STALE ---
                            if (!becameStaleAt) {
                                // First time detected as stale: Set becameStaleAt
                                updates.becameStaleAt = now;
                                console.debug(`Marking list ${listId} as stale (first time).`);
                            } else {
                                // Already stale: Check notification triggers
                                const currentBecameStaleAt = becameStaleAt; // Use the existing date

                                // Check Stale Reminder
                                const reminderThreshold = new Date(currentBecameStaleAt);
                                reminderThreshold.setHours(reminderThreshold.getHours() + RANKING_STALE_REMINDER_HOURS);
                                const shouldSendStaleReminder =
                                    now >= reminderThreshold &&
                                    (!lastStaleReminderSentAt || lastStaleReminderSentAt < currentBecameStaleAt); // Send only once per stale period

                                if (shouldSendStaleReminder) {
                                    console.debug(`Triggering stale reminder for list ${listId}.`);
                                    const gracePeriodEnd = new Date(currentBecameStaleAt);
                                    gracePeriodEnd.setDate(
                                        gracePeriodEnd.getDate() + RANKING_STALENESS_GRACE_PERIOD_DAYS,
                                    );
                                    const gracePeriodEndFormatted = gracePeriodEnd.toLocaleDateString(); // Or format as needed

                                    // Fetch recipient user details
                                    const recipientUser = await getUserPrivate(userId);
                                    if (recipientUser) {
                                        notificationPromises.push(
                                            sendNotifications("ranking_stale_reminder", [recipientUser], {
                                                // Use sendNotifications
                                                circle: circle, // Pass the fetched circle object
                                                user: undefined, // System notification, use undefined instead of null
                                                itemType: itemType,
                                                itemCount: unrankedItemCount,
                                                circleName: circleName,
                                                gracePeriodEndDate: gracePeriodEndFormatted,
                                                link: `/circles/${circle.handle}/${itemType}`,
                                                circleId: circleId,
                                                // Construct message within sendNotifications if needed, or pass parts
                                                messageBody: `You have ${unrankedItemCount} new ${itemType} to rank in "${circleName}" before ${gracePeriodEndFormatted}.`,
                                                title: `Rank ${itemType} in ${circleName}`,
                                            }),
                                        );
                                        updates.lastStaleReminderSentAt = now;
                                    } else {
                                        console.warn(`Could not find user ${userId} to send stale reminder.`);
                                    }
                                }

                                // Check Grace Period Ended
                                const gracePeriodEndThreshold = new Date(currentBecameStaleAt);
                                gracePeriodEndThreshold.setDate(
                                    gracePeriodEndThreshold.getDate() + RANKING_STALENESS_GRACE_PERIOD_DAYS,
                                );
                                const shouldSendGracePeriodEnded =
                                    now >= gracePeriodEndThreshold &&
                                    (!lastGracePeriodEndedSentAt || lastGracePeriodEndedSentAt < currentBecameStaleAt); // Send only once per stale period

                                if (shouldSendGracePeriodEnded) {
                                    console.debug(`Triggering grace period ended notification for list ${listId}.`);
                                    // Fetch recipient user details
                                    const recipientUser = await getUserPrivate(userId);
                                    if (recipientUser) {
                                        notificationPromises.push(
                                            sendNotifications("ranking_grace_period_ended", [recipientUser], {
                                                // Use sendNotifications
                                                circle: circle, // Pass the fetched circle object
                                                user: undefined, // System notification, use undefined instead of null
                                                itemType: itemType,
                                                itemCount: unrankedItemCount,
                                                circleName: circleName,
                                                link: `/circles/${circle.handle}/${itemType}`,
                                                circleId: circleId,
                                                messageBody: `Your ranking of ${itemType} in "${circleName}" is no longer counted. Rank the remaining ${unrankedItemCount} items for your rank to be counted again.`,
                                                title: `Ranking Inactive in ${circleName}`,
                                            }),
                                        );
                                        updates.lastGracePeriodEndedSentAt = now;
                                    } else {
                                        console.warn(
                                            `Could not find user ${userId} to send grace period ended notification.`,
                                        );
                                    }
                                }
                            }
                        } else {
                            // --- List is currently COMPLETE ---
                            if (becameStaleAt) {
                                // Was stale, now complete: Unset staleness fields
                                unsets.becameStaleAt = "";
                                unsets.lastStaleReminderSentAt = "";
                                unsets.lastGracePeriodEndedSentAt = "";
                                console.debug(`Marking list ${listId} as complete (was stale).`);
                            }
                        }

                        // Add update operation to promises if there are changes
                        const updateOp: any = {};
                        if (Object.keys(updates).length > 0) updateOp.$set = updates;
                        if (Object.keys(unsets).length > 0) updateOp.$unset = unsets;

                        if (Object.keys(updateOp).length > 0) {
                            updatePromises.push(RankedLists.updateOne({ _id: listId }, updateOp));
                        }
                    } // End loop through lists

                    // Wait for all DB updates and notifications for this circle/type
                    await Promise.allSettled([...updatePromises, ...notificationPromises]);
                    console.debug(`Finished processing ${itemType} for circle ${circleId}.`);
                } catch (listProcessingError) {
                    console.error(`Error processing ${itemType} lists for circle ${circleId}:`, listProcessingError);
                }
            } // End loop through item types
        } // End loop through circles

        console.log("Periodic ranking processing finished.");
    } catch (error) {
        console.error("Error during periodic ranking processing:", error);
    }
};
