import { NextResponse } from "next/server";
import { getPublicPushConfig } from "@/lib/push/config";

export async function GET() {
    return NextResponse.json(getPublicPushConfig(), {
        headers: {
            "Cache-Control": "no-store, no-cache, must-revalidate",
        },
    });
}
