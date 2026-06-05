"use server";

import { getMetricsForCircles } from "@/lib/data/circle";
import { searchDiscoverableCircles } from "@/lib/data/search";
import { Circle, WithMetric } from "@/models/models";
import { getAuthenticatedUserDid } from "@/lib/auth/auth";

/**
 * Deterministic search for discoverable circles, projects, and user profiles.
 * The existing UI still passes category state separately, so this action returns the
 * full discoverable result set and lets the client apply the final category filter.
 */
export async function searchContentAction(
    query: string,
    _selectedCategories: string[],
    sdgHandles?: string[],
): Promise<WithMetric<Circle>[]> {
    if (!query && (!sdgHandles || sdgHandles.length === 0)) {
        return [];
    }

    try {
        const results = await searchDiscoverableCircles({
            query,
            limit: 24,
            sdgHandles,
        });

        if (results.length === 0) {
            return [];
        }

        const searchMetricsById = new Map(
            results
                .filter((result) => result._id)
                .map((result) => [
                    result._id as string,
                    {
                        searchRank: result.metrics?.searchRank ?? 0,
                        similarity: result.metrics?.similarity ?? 0,
                    },
                ]),
        );

        const userDid = await getAuthenticatedUserDid();
        if (userDid) {
            await getMetricsForCircles(results, userDid);
        }

        results.forEach((result) => {
            const searchMetrics = result._id ? searchMetricsById.get(result._id) : undefined;
            result.metrics = {
                ...result.metrics,
                searchRank: searchMetrics?.searchRank ?? result.metrics?.searchRank ?? 0,
                similarity: searchMetrics?.similarity ?? result.metrics?.similarity ?? 0,
            };
        });

        results.sort((left, right) => {
            const searchDiff = (right.metrics?.searchRank ?? 0) - (left.metrics?.searchRank ?? 0);
            if (searchDiff !== 0) {
                return searchDiff;
            }

            return (left.metrics?.rank ?? 0) - (right.metrics?.rank ?? 0);
        });

        return results;
    } catch (error) {
        console.error("Error in searchContentAction:", error);
        return [];
    }
}
