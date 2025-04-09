"use server";

import { semanticSearchContent, SearchResultItem } from "@/lib/data/vdb";
import { revalidatePath } from "next/cache";

/**
 * Server action to perform semantic search.
 * @param query The search query string.
 * @param categories An array of categories (collections) to search within (e.g., ['circles', 'posts']).
 * @returns A promise that resolves to an array of SearchResultItem.
 */
export async function searchContentAction(query: string, categories: string[]): Promise<SearchResultItem[]> {
    console.log(`Executing searchContentAction with query: "${query}", categories: [${categories.join(", ")}]`);

    if (!query || categories.length === 0) {
        console.log("Search query or categories empty, returning empty results.");
        return [];
    }

    try {
        const results = await semanticSearchContent({ query, categories });
        console.log(`Search returned ${results.length} results.`);
        // Optionally revalidate paths if search results should trigger cache updates
        // revalidatePath('/map'); // Or a more specific path if needed
        return results;
    } catch (error) {
        console.error("Error in searchContentAction:", error);
        // Depending on requirements, you might want to throw the error
        // or return an empty array / specific error object
        return [];
    }
}
