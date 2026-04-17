import { NextRequest, NextResponse } from "next/server";
import { processDueMessageEmailReminders } from "@/lib/data/message-reminders";

export async function GET(req: NextRequest) {
    const authToken = process.env.CRON_SECRET;
    const bearerToken = req.headers.get("authorization");

    if (!authToken || !bearerToken || bearerToken.split(" ")[1] !== authToken) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const result = await processDueMessageEmailReminders();
        return NextResponse.json({ success: true, ...result });
    } catch (error) {
        console.error("Error processing message reminder emails:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
