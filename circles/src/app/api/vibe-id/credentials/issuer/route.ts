import { NextResponse } from "next/server";
import { getMembershipCredentialIssuerMetadata } from "@/lib/vibe-id/membership-credentials";
import { isVibeIdEnabled, VIBE_ID_DISABLED_MESSAGE } from "@/lib/vibe-id/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
    if (!isVibeIdEnabled()) {
        return NextResponse.json({ success: false, message: VIBE_ID_DISABLED_MESSAGE }, { status: 404 });
    }

    const metadata = getMembershipCredentialIssuerMetadata();
    if (!metadata) {
        return NextResponse.json({ success: false, message: "Credential issuer is not configured." }, { status: 503 });
    }

    return NextResponse.json(metadata);
}
