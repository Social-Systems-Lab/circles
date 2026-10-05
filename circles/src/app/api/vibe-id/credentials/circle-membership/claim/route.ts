import { NextRequest, NextResponse } from "next/server";
import { redeemMembershipCredentialHandoff } from "@/lib/vibe-id/membership-credential-handoffs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RESPONSE_HEADERS = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
const unavailable = () =>
    NextResponse.json(
        { success: false, message: "Credential is not available." },
        { status: 404, headers: RESPONSE_HEADERS },
    );

export async function GET(request: NextRequest) {
    const token = request.nextUrl.searchParams.get("token")?.trim() || "";
    let envelope = null;
    try {
        envelope = await redeemMembershipCredentialHandoff({ token, credentialType: "circle" });
    } catch {
        return unavailable();
    }
    if (!envelope) {
        return unavailable();
    }

    return NextResponse.json(envelope, { headers: RESPONSE_HEADERS });
}
