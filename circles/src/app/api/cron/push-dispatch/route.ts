import { NextRequest, NextResponse } from "next/server";
import { processPendingPushJobs } from "@/lib/push/dispatcher";

export async function GET(req: NextRequest) {
    const authToken = process.env.CRON_SECRET;
    const bearerToken = req.headers.get("authorization");

    if (!authToken || !bearerToken || bearerToken.split(" ")[1] !== authToken) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const stats = await processPendingPushJobs(50);
        return NextResponse.json({ success: true, ...stats });
    } catch (error) {
        console.error("Error processing push dispatch queue:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
