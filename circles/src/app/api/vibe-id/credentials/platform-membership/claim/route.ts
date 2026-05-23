import { NextRequest, NextResponse } from "next/server";
import { createPlatformMembershipCredentialEnvelope } from "@/lib/vibe-id/membership-credentials";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
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
