import { NextRequest, NextResponse } from "next/server";
import { createPlatformMembershipCredentialEnvelope } from "@/lib/vibe-id/membership-credentials";
import { isVibeIdEnabled, VIBE_ID_DISABLED_MESSAGE } from "@/lib/vibe-id/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
    if (!isVibeIdEnabled()) {
        return NextResponse.json({ success: false, message: VIBE_ID_DISABLED_MESSAGE }, { status: 404 });
    }

    const subjectDid = request.nextUrl.searchParams.get("subjectDid")?.trim() || "";

    if (!subjectDid) {
        return NextResponse.json({ success: false, message: "Missing subjectDid." }, { status: 400 });
    }

    const envelope = await createPlatformMembershipCredentialEnvelope({ subjectVibeDid: subjectDid });
    if (!envelope) {
        return NextResponse.json(
            { success: false, message: "Membership credential is not available for this VibeID." },
            { status: 404 },
        );
    }

    return NextResponse.json(envelope);
}
