import { NextRequest } from "next/server";
import { completeVibeIdSignup } from "@/lib/auth/vibe-id";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
    return completeVibeIdSignup(request);
}
