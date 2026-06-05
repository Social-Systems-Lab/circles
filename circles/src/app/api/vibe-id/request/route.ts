import { NextRequest } from "next/server";
import { createVibeIdRequest } from "@/lib/auth/vibe-id";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
    return createVibeIdRequest(request);
}
