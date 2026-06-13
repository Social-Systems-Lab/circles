import { NextRequest, NextResponse } from "next/server";
import { readVibeIdStatus } from "@/lib/auth/vibe-id";
import { isVibeIdEnabled, VIBE_ID_DISABLED_MESSAGE } from "@/lib/vibe-id/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ requestId: string }> },
) {
    if (!isVibeIdEnabled()) {
        return NextResponse.json({ status: "disabled", message: VIBE_ID_DISABLED_MESSAGE }, { status: 404 });
    }

    const { requestId } = await params;
    return readVibeIdStatus(request, requestId);
}
