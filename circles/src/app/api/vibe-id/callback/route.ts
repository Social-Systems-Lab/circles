import { NextRequest } from "next/server";
import { handleVibeIdCallback } from "@/lib/auth/vibe-id";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
    return handleVibeIdCallback(request);
}
