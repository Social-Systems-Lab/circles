"use server";

import { semanticSearchContent, SearchResultItem } from "@/lib/data/vdb";
import { getCirclesByIds, getMetricsForCircles } from "@/lib/data/circle"; // Corrected function name
import { Circle, WithMetric, Metrics } from "@/models/models"; // Import necessary types
import { getAuthenticatedUserDid } from "@/lib/auth/auth"; // Corrected import: Import function to get user DID
import { revalidatePath } from "next/cache";

/**
 * Server action to perform semantic search for Circles/Projects/Users and fetch full details with metrics.
 * @param query The search query string.
 * @param categories An array of categories (collections) to search within (e.g., ['circles', 'projects', 'users']).
 * @returns A promise that resolves to an array of enriched Circle items with metrics (including searchRank).
 */
export async function searchContentAction(query: string, categories: string[]): Promise<WithMetric<Circle>[]> {
    // Filter categories to only include circle types for now
    const circleCategories = categories.filter((cat) => ["circles", "projects", "users"].includes(cat));
    console.log(
        `Executing searchContentAction with query: "${query}", filtered categories: [${circleCategories.join(", ")}]`,
    );

    if (!query || circleCategories.length === 0) {
        console.log("Search query or relevant categories empty, returning empty results.");
        return [];
    }

    try {
        // 1. Perform Semantic Search for relevant types
        const semanticResults = await semanticSearchContent({ query, categories: circleCategories });
        console.log(`Semantic search returned ${semanticResults.length} results.`);

        // Filter results to ensure they are of the expected types (double-check)
        const circleTypeResults = semanticResults.filter((r) => ["circle", "project", "user"].includes(r.type));

        if (circleTypeResults.length === 0) {
            console.log("No results of type circle, project, or user found.");
            return [];
        }

        // 2. Extract IDs and Scores for the filtered results
        const resultIds = circleTypeResults.map((r) => r._id);
        const scoresMap = new Map(circleTypeResults.map((r) => [r._id, r.score]));

        // 3. Fetch Base Circle Data
        console.log("Fetching base circle data for IDs:", resultIds);
        const baseCircles = await getCirclesByIds(resultIds);
        console.log(`Fetched ${baseCircles.length} base circles.`);

        if (baseCircles.length === 0) {
            console.log("No base circles found for the retrieved IDs.");
            return [];
        }

        // 4. Fetch Metrics for the Circles
        // 4. Prepare circles with initial search rank metric for getMetricsForCircles
        let circlesWithSearchRank: WithMetric<Circle>[] = baseCircles.map((circle) => {
            const searchRank = scoresMap.get(circle._id) ?? 0;
            return {
                ...circle,
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
