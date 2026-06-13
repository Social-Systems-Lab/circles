import { NextRequest, NextResponse } from "next/server";
import { Circles } from "@/lib/data/db";
import { getMember } from "@/lib/data/member";
import { isVibeIdEnabled, VIBE_ID_DISABLED_MESSAGE } from "@/lib/vibe-id/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
    if (!isVibeIdEnabled()) {
        return NextResponse.json({ status: "disabled", message: VIBE_ID_DISABLED_MESSAGE }, { status: 404 });
    }

    const circleId = request.nextUrl.searchParams.get("circleId")?.trim() || "";
    const subjectDid = request.nextUrl.searchParams.get("subjectDid")?.trim() || "";

    if (!circleId || !subjectDid) {
        return NextResponse.json({ status: "unknown", message: "Missing circleId or subjectDid." }, { status: 400 });
    }

    const user = await Circles.findOne(
        {
            circleType: "user",
            "metadata.authProviders.vibeId.did": subjectDid,
        },
        { projection: { did: 1 } },
    );
    if (!user?.did) {
        return NextResponse.json({
            status: "revoked",
            checkedAt: new Date().toISOString(),
            reason: "subject_not_found",
        });
    }

    const member = await getMember(user.did, circleId);
    const isActiveMember = !!member?.userGroups?.includes("members");

    return NextResponse.json({
        status: isActiveMember ? "active" : "revoked",
        checkedAt: new Date().toISOString(),
        reason: isActiveMember ? undefined : "membership_not_active",
    });
}
