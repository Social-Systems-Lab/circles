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
export async function searchContentAction(query: string, selectedCategories: string[]): Promise<WithMetric<Circle>[]> {
    // Map selected categories to VDB categories
    // "circles", "projects", "users" map to VDB "circles"
    // "posts" maps to VDB "posts" (though we ignore posts for now)
    const vdbSearchCategories: VbdCategories[] = [];
    if (selectedCategories.some((cat) => ["circles", "projects", "users"].includes(cat))) {
        vdbSearchCategories.push("circles");
    }
    // Add other mappings here if needed in the future (e.g., posts)
    // if (selectedCategories.includes("posts")) {
    //     vdbSearchCategories.push("posts");
    // }

    console.log(
        `Executing searchContentAction with query: "${query}", selected UI categories: [${selectedCategories.join(", ")}], VDB categories: [${vdbSearchCategories.join(", ")}]`,
    );

    if (!query || vdbSearchCategories.length === 0) {
        console.log("Search query or relevant VDB categories empty, returning empty results.");
        return [];
    }

    try {
        // 1. Perform Semantic Search using VDB categories
        const semanticResults = await semanticSearchContent({ query, categories: vdbSearchCategories });
        console.log(`Semantic search returned ${semanticResults.length} results.`);

        // 2. Filter results based on the original selectedCategories (specifically for 'circles' VDB results)
        const filteredResults = semanticResults.filter((result) => {
            if (result.type === "circle" || result.type === "project" || result.type === "user") {
                // Check if the specific type ('circle', 'project', 'user') was selected by the user
                // Map the result type back to the UI category name convention if needed (e.g., 'circle' -> 'circles')
                const uiCategory =
                    result.type === "circle" ? "circles" : result.type === "project" ? "projects" : "users";
                return selectedCategories.includes(uiCategory);
            }
            // Include results from other VDB categories directly if they were searched (e.g., posts - but ignored for now)
            // return selectedCategories.includes(result.type); // Example if posts were included
            return false; // Ignore non-circle types for now
        });

        console.log(`Filtered results based on UI selection: ${filteredResults.length}`);

        if (filteredResults.length === 0) {
            console.log("No results matched the specific UI category selection.");
            return [];
        }

        // 3. Extract IDs and Scores for the filtered results
        const resultIds = filteredResults.map((r) => r._id);
        const scoresMap = new Map(filteredResults.map((r) => [r._id, r.score]));

        // 4. Fetch Base Circle Data
        console.log("Fetching base circle data for filtered IDs:", resultIds);
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
