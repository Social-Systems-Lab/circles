// src/app/api/cron/process-rankings/route.ts
import { NextResponse } from "next/server";
import { processRankingsPeriodically } from "@/lib/data/ranking";

// Simple secret check to prevent unauthorized access (replace with a more robust method if needed)
const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(request: Request) {
    // Check for secret in headers or query params
    const authHeader = request.headers.get("authorization");
    const url = new URL(request.url);
    const secretQueryParam = url.searchParams.get("secret");

    if (!CRON_SECRET || !(authHeader === `Bearer ${CRON_SECRET}` || secretQueryParam === CRON_SECRET)) {
        console.warn("Unauthorized attempt to access process-rankings cron endpoint.");
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log("Received authorized request to process rankings periodically.");

    try {
        // Execute the periodic processing function (no need to await if it can run in the background)
        processRankingsPeriodically()
            .then(() => {
                console.log("processRankingsPeriodically finished successfully (async).");
            })
            .catch((error) => {
                console.error("Error during background processRankingsPeriodically:", error);
            });

        // Return success immediately, letting the job run in the background
        return NextResponse.json({ message: "Ranking processing job started." });
    } catch (error) {
        console.error("Error starting ranking processing job:", error);
        return NextResponse.json({ error: "Failed to start ranking processing job" }, { status: 500 });
    }
}

// Optional: Add basic security like a secret key check
// export const dynamic = 'force-dynamic'; // Ensure the route is not statically generated if needed
