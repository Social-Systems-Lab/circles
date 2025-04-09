"use server";

import { semanticSearchContent, SearchResultItem } from "@/lib/data/vdb";
import { getCirclesWithMetrics } from "@/lib/data/circle"; // Import function to fetch full data
import { Content, WithMetric } from "@/models/models"; // Import necessary types
import { revalidatePath } from "next/cache";

/**
 * Server action to perform semantic search and fetch full content details.
 * @param query The search query string.
 * @param categories An array of categories (collections) to search within (e.g., ['circles', 'posts']).
 * @returns A promise that resolves to an array of enriched Content items with metrics (including searchRank).
 */
export async function searchContentAction(query: string, categories: string[]): Promise<WithMetric<Content>[]> {
    console.log(`Executing searchContentAction with query: "${query}", categories: [${categories.join(", ")}]`);

    if (!query || categories.length === 0) {
        console.log("Search query or categories empty, returning empty results.");
        return [];
    }

    try {
        // 1. Perform Semantic Search
        const semanticResults = await semanticSearchContent({ query, categories });
        console.log(`Semantic search returned ${semanticResults.length} results.`);

        if (semanticResults.length === 0) {
            return []; // No results from semantic search
        }

        // 2. Extract IDs and Scores
        const resultIds = semanticResults.map((r) => r._id);
        const scoresMap = new Map(semanticResults.map((r) => [r._id, r.score]));

        // 3. Fetch Full Data for each ID
        console.log("Fetching full data for IDs individually:", resultIds);
        const fetchPromises = resultIds.map(async (id) => {
            try {
                // Assuming getCirclesWithMetrics returns an array even for a single ID
                const contentItemsArray = await getCirclesWithMetrics(id);
                if (!contentItemsArray || contentItemsArray.length === 0) {
                    console.warn(`No content found for ID ${id} during full data fetch.`);
                    return null;
                }
                const contentItem = contentItemsArray[0]; // Take the first item

                // 4. Merge Search Rank (Score)
                const searchRank = scoresMap.get(id) ?? 0;
                return {
                    ...contentItem,
                    metrics: {
                        ...(contentItem.metrics ?? {}), // Safely spread existing metrics
                        searchRank: searchRank,
                        similarity: searchRank, // Also store as similarity
                    },
                } as WithMetric<Content>; // Assert the final type
            } catch (fetchError) {
                console.error(`Failed to fetch full data for ID ${id}:`, fetchError);
                return null;
            }
        });

        const enrichedResultsNullable = await Promise.all(fetchPromises);
        const enrichedResults = enrichedResultsNullable.filter((item): item is WithMetric<Content> => item !== null);

        // 5. Sort Results by Search Rank
        enrichedResults.sort((a, b) => (b.metrics?.searchRank ?? 0) - (a.metrics?.searchRank ?? 0));

        console.log(`Returning ${enrichedResults.length} enriched and sorted results.`);
        return enrichedResults;
    } catch (error) {
        console.error("Error in searchContentAction:", error);
        return [];
    }
}
