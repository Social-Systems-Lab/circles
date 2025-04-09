"use server";

import { semanticSearchContent, SearchResultItem, VbdCategories } from "@/lib/data/vdb"; // Import VbdCategories
import { getCirclesByIds, getMetricsForCircles } from "@/lib/data/circle";
import { Circle, WithMetric, Metrics, CircleType } from "@/models/models"; // Import CircleType
import { getAuthenticatedUserDid } from "@/lib/auth/auth";
import { revalidatePath } from "next/cache";

/**
 * Server action to perform semantic search for Circles/Projects/Users and fetch full details with metrics.
 * @param query The search query string.
 * @param categories An array of categories (collections) to search within (e.g., ['circles', 'projects', 'users']).
 * @returns A promise that resolves to an array of enriched Circle items with metrics (including searchRank).
 */
export async function searchContentAction(
    query: string,
    selectedCategories: string[], // Keep param for compatibility, but ignore it
): Promise<WithMetric<Circle>[]> {
    // Always search the 'circles' VDB collection which contains circles, projects, and users
    const vdbSearchCategories: VbdCategories[] = ["circles"];

    console.log(
        `Executing searchContentAction with query: "${query}", searching VDB categories: [${vdbSearchCategories.join(", ")}]`,
    );

    if (!query) {
        console.log("Search query empty, returning empty results.");
        return [];
    }

    try {
        // 1. Perform Semantic Search using VDB 'circles' category
        const semanticResults = await semanticSearchContent({ query, categories: vdbSearchCategories });
        console.log(`Semantic search returned ${semanticResults.length} raw results.`);

        // Client-side filtering is now done in MapSwipeContainer
        // Remove server-side filtering step

        if (semanticResults.length === 0) {
            console.log("Semantic search returned no results.");
            return [];
        }

        // 2. Extract IDs and Scores for ALL semantic results
        const resultIds = semanticResults.map((r) => r._id);
        const scoresMap = new Map(semanticResults.map((r) => [r._id, r.score]));

        // 3. Fetch Base Circle Data for ALL results
        console.log("Fetching base circle data for ALL semantic result IDs:", resultIds);
        const baseCircles = await getCirclesByIds(resultIds);
        console.log(`Fetched ${baseCircles.length} base circles.`);

        if (baseCircles.length === 0) {
            console.log("No base circles found for the retrieved IDs.");
            return [];
        }

        // 4. Prepare circles with initial search rank metric
        let circlesWithSearchRank: WithMetric<Circle>[] = baseCircles.map((circle) => {
            const searchRank = scoresMap.get(circle._id) ?? 0; // Get score using MongoDB _id
            return {
                ...circle, // Spread the fetched circle data
                metrics: {
                    // Initialize metrics object
                    searchRank: searchRank,
                    similarity: searchRank, // Also store score as similarity
                },
            };
        });

        // 5. Fetch and Add Other Metrics using getMetricsForCircles
        const userDid = await getAuthenticatedUserDid(); // Corrected function call
        if (!userDid) {
            console.warn("User not authenticated, cannot fetch personalized metrics.");
            // Proceed without personalized metrics, keeping only searchRank/similarity
        } else {
            console.log("Fetching additional metrics for circles...");
            // getMetricsForCircles mutates the array and sorts it by its internal rank
            await getMetricsForCircles(circlesWithSearchRank, userDid); // Pass userDid
            console.log("Additional metrics added and sorted by internal rank.");
            // Note: circlesWithSearchRank is now potentially sorted differently
        }

        // 6. Re-sort by the original Search Rank (from semantic search)
        // If the semantic relevance is the primary sort key desired.
        circlesWithSearchRank.sort((a, b) => (b.metrics?.searchRank ?? 0) - (a.metrics?.searchRank ?? 0));

        console.log(`Returning ${circlesWithSearchRank.length} enriched circles, sorted by search rank.`);
        // Ensure the final return type matches the promise
        const finalResults: WithMetric<Circle>[] = circlesWithSearchRank;
        return finalResults;
    } catch (error) {
        console.error("Error in searchContentAction:", error);
        // Removed duplicate catch block and incorrect variable reference
        return [];
    }
}
