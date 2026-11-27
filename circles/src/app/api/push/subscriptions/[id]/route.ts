import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getAuthenticatedUserDid } from "@/lib/auth/auth";
import { assertSameOriginMutation } from "@/lib/push/csrf";
import { pushMutationRateLimiter } from "@/lib/push/rate-limit";
import { revokePushSubscriptionForUser } from "@/lib/push/subscriptions";

export async function DELETE(
    req: NextRequest,
    context: { params: Promise<{ id: string }> },
) {
    const csrf = assertSameOriginMutation(req);
    if (!csrf.ok) {
        return NextResponse.json({ error: csrf.error }, { status: csrf.status });
    }

    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rate = pushMutationRateLimiter.check(`push-sub-delete:${userDid}`, 20, 10 * 60 * 1000);
    if (!rate.allowed) {
        return NextResponse.json(
            { error: "Too many push subscription updates. Please try again later." },
            { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
        );
    }

    const { id } = await context.params;
    if (!id || !ObjectId.isValid(id)) {
        return NextResponse.json({ error: "Invalid subscription ID" }, { status: 400 });
    }

    try {
        const result = await revokePushSubscriptionForUser({
            userDid,
            subscriptionId: id,
            reason: "user_revoked",
        });
        if (!result.revoked) {
            return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
        }
        return NextResponse.json({ revoked: true, subscriptionId: result.subscriptionId });
    } catch (error) {
        console.error("Failed to revoke push subscription by ID:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
