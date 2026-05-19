import { NextRequest, NextResponse } from "next/server";
import { createCircleMembershipCredentialEnvelope } from "@/lib/vibe-id/membership-credentials";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
    const circleId = request.nextUrl.searchParams.get("circleId")?.trim() || "";
    const subjectDid = request.nextUrl.searchParams.get("subjectDid")?.trim() || "";

    if (!circleId || !subjectDid) {
        return NextResponse.json({ success: false, message: "Missing circleId or subjectDid." }, { status: 400 });
    }

    const envelope = await createCircleMembershipCredentialEnvelope({ circleId, subjectVibeDid: subjectDid });
    if (!envelope) {
        return NextResponse.json(
            { success: false, message: "Credential is not available for this identity and circle." },
            { status: 404 },
        );
    }

    return NextResponse.json(envelope);
}
