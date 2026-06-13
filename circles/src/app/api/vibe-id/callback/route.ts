import { NextRequest, NextResponse } from "next/server";
import { handleVibeIdCallback } from "@/lib/auth/vibe-id";
import { isVibeIdEnabled, VIBE_ID_DISABLED_MESSAGE } from "@/lib/vibe-id/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
    if (!isVibeIdEnabled()) {
        return NextResponse.json({ success: false, message: VIBE_ID_DISABLED_MESSAGE }, { status: 404 });
    }

    return handleVibeIdCallback(request);
}
