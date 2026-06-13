import { NextRequest, NextResponse } from "next/server";
import { Circles } from "@/lib/data/db";
import { isPlatformMember } from "@/lib/vibe-id/membership-credentials";
import { isVibeIdEnabled, VIBE_ID_DISABLED_MESSAGE } from "@/lib/vibe-id/config";
import type { Circle } from "@/models/models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
    if (!isVibeIdEnabled()) {
        return NextResponse.json({ status: "disabled", message: VIBE_ID_DISABLED_MESSAGE }, { status: 404 });
    }

    const subjectDid = request.nextUrl.searchParams.get("subjectDid")?.trim() || "";

    if (!subjectDid) {
        return NextResponse.json({ status: "unknown", message: "Missing subjectDid." }, { status: 400 });
    }

    const user = await Circles.findOne({
        circleType: "user",
        "metadata.authProviders.vibeId.did": subjectDid,
    });
    if (!user) {
        return NextResponse.json({
            status: "revoked",
            checkedAt: new Date().toISOString(),
            reason: "subject_not_found",
        });
    }

    const active = isPlatformMember(user as Circle);
    return NextResponse.json({
        status: active ? "active" : "revoked",
        checkedAt: new Date().toISOString(),
        reason: active ? undefined : "membership_not_active",
    });
}
