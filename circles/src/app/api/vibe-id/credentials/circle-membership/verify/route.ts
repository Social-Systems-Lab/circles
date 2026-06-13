import { NextRequest, NextResponse } from "next/server";
import { Circles } from "@/lib/data/db";
import { getMember } from "@/lib/data/member";
import { verifyCircleMembershipCredentialEnvelope } from "@/lib/vibe-id/membership-credentials";
import { isVibeIdEnabled, VIBE_ID_DISABLED_MESSAGE } from "@/lib/vibe-id/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
    if (!isVibeIdEnabled()) {
        return NextResponse.json(
            { ok: false, access: "denied", message: VIBE_ID_DISABLED_MESSAGE },
            { status: 404 },
        );
    }

    const body = await request.json().catch(() => null);
    const envelope = body?.kind === "credential.v1" ? body : body?.envelope;
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
            message: "Credential subject is not linked to a Peerify account.",
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
