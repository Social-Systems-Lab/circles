import { NextResponse } from "next/server";
import { getKamooniMembershipTemplate } from "@/lib/vibe-id/membership-credentials";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
    return NextResponse.json(getKamooniMembershipTemplate());
}
