import { NextResponse } from "next/server";
import { getMembershipCredentialIssuerMetadata } from "@/lib/vibe-id/membership-credentials";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
    const metadata = getMembershipCredentialIssuerMetadata();
    if (!metadata) {
        return NextResponse.json({ success: false, message: "Credential issuer is not configured." }, { status: 503 });
    }

    return NextResponse.json(metadata);
}
