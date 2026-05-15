import { NextRequest } from "next/server";
import { readVibeIdStatus } from "@/lib/auth/vibe-id";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ requestId: string }> },
) {
    const { requestId } = await params;
    return readVibeIdStatus(request, requestId);
}
