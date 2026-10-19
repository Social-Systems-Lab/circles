import { NextRequest, NextResponse } from "next/server";
import { processFirstTopicNotifications } from "@/lib/chat/first-topic-notifications";

export async function GET(req: NextRequest) {
    const authToken = process.env.CRON_SECRET;
    const bearerToken = req.headers.get("authorization");
    if (!authToken || !bearerToken || bearerToken.split(" ")[1] !== authToken) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    try {
        return NextResponse.json({ success: true, ...(await processFirstTopicNotifications()) });
    } catch (error) {
        console.error("Error processing first-topic notifications:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
