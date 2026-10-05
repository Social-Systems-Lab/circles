import { NextRequest, NextResponse } from "next/server";
import { resolveMembershipCredentialStatus } from "@/lib/vibe-id/membership-credential-statuses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
    const token = request.nextUrl.searchParams.get("token")?.trim() || "";
    let status: "active" | "revoked" | "unknown" = "unknown";
    try {
        status = await resolveMembershipCredentialStatus({ token, credentialType: "platform" });
    } catch {
        status = "unknown";
    }
    return NextResponse.json(
        {
            status,
            checkedAt: new Date().toISOString(),
        },
        { headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } },
    );
}
