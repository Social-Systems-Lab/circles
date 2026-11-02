import { NextRequest, NextResponse } from "next/server";
import { Circles } from "@/lib/data/db";
import { getMember } from "@/lib/data/member";
import { verifyCircleMembershipCredentialEnvelope } from "@/lib/vibe-id/membership-credentials";
import { readJsonBodyLimited } from "@/lib/security/bounded-input";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
    const bodyResult = await readJsonBodyLimited(request, 64 * 1024);
    if (!bodyResult.ok) return NextResponse.json({ ok: false, error: bodyResult.error }, { status: bodyResult.status });
    const body = bodyResult.value;
    const bodyRecord =
        body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
    const envelope = bodyRecord?.kind === "credential.v1" ? bodyRecord : bodyRecord?.envelope;
    const verification = verifyCircleMembershipCredentialEnvelope(envelope);

    if (!verification.ok) {
        return NextResponse.json(
            {
                ok: false,
                access: "denied",
                error: verification.error,
                message: verification.message,
            },
            { status: 400 },
        );
    }

    const user = await Circles.findOne(
        {
            circleType: "user",
            "metadata.authProviders.vibeId.did": verification.subjectDid,
        },
        { projection: { did: 1 } },
    );
    if (!user?.did) {
        return NextResponse.json({
            ok: false,
            access: "denied",
            error: "subject_not_found",
            message: "Credential subject is not linked to a Kamooni account.",
        });
    }

    const member = await getMember(user.did, verification.circleId);
    const isActiveMember = !!member?.userGroups?.includes("members");
    return NextResponse.json({
        ok: isActiveMember,
        access: isActiveMember ? "granted" : "denied",
        credentialId: verification.credentialId,
        subjectDid: verification.subjectDid,
        circleId: verification.circleId,
        roles: member?.userGroups ?? verification.roles,
        checkedAt: new Date().toISOString(),
        error: isActiveMember ? undefined : "membership_not_active",
    });
}
