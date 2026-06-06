import { NextRequest, NextResponse } from "next/server";
import { processDailyActionableEmailDigests } from "@/lib/data/actionable-email-digests";
import { hasValidBearerToken } from "@/lib/security/request-auth";

export async function GET(req: NextRequest) {
    const authToken = process.env.CRON_SECRET;
    const bearerToken = req.headers.get("authorization");

    if (!hasValidBearerToken(bearerToken, authToken)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const result = await processDailyActionableEmailDigests();
        return NextResponse.json({ success: true, ...result });
    } catch (error) {
        console.error("Error processing actionable email digests:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
