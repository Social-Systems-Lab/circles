import { NextRequest, NextResponse } from "next/server";
import { processMessageEmailReminderById } from "@/lib/data/message-reminders";
import { readJsonBodyLimited } from "@/lib/security/bounded-input";

export async function POST(req: NextRequest) {
    const authToken = process.env.CRON_SECRET;
    const bearerToken = req.headers.get("authorization");

    if (!authToken || !bearerToken || bearerToken.split(" ")[1] !== authToken) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const bodyResult = await readJsonBodyLimited(req, 4 * 1024);
    if (!bodyResult.ok) return NextResponse.json({ error: bodyResult.error }, { status: bodyResult.status });
    const body =
        bodyResult.value && typeof bodyResult.value === "object" && !Array.isArray(bodyResult.value)
            ? (bodyResult.value as { reminderId?: unknown })
            : null;
    const reminderId = typeof body?.reminderId === "string" ? body.reminderId.trim().slice(0, 128) : "";

    if (!reminderId) {
        return NextResponse.json({ error: "reminderId is required" }, { status: 400 });
    }

    try {
        const result = await processMessageEmailReminderById(reminderId);

        if (result.code === "invalid_id") {
            return NextResponse.json(result, { status: 400 });
        }

        if (result.code === "not_found") {
            return NextResponse.json(result, { status: 404 });
        }

        if (result.code === "not_pending") {
            return NextResponse.json(result, { status: 409 });
        }

        return NextResponse.json({
            success: true,
            ...result,
        });
    } catch (error) {
        console.error("Error processing manual message reminder:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
