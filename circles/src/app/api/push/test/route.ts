import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserDid } from "@/lib/auth/auth";
import { isWebPushDispatchEnabled } from "@/lib/push/config";
import { assertSameOriginMutation } from "@/lib/push/csrf";
import { pushTestRateLimiter } from "@/lib/push/rate-limit";
import { getActivePushSubscriptionDocsForUser, revokePushSubscriptionById } from "@/lib/push/subscriptions";
import { sendWebPushNotification } from "@/lib/push/web-push-adapter";

export async function POST(req: NextRequest) {
    if (!isWebPushDispatchEnabled()) {
        return NextResponse.json({ error: "Web Push dispatch is disabled" }, { status: 404 });
    }

    const csrf = assertSameOriginMutation(req);
    if (!csrf.ok) {
        return NextResponse.json({ error: csrf.error }, { status: csrf.status });
    }

    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rate = pushTestRateLimiter.check(`push-test:${userDid}`, 3, 10 * 60 * 1000);
    if (!rate.allowed) {
        return NextResponse.json(
            { error: "Test notification limit reached. Please try again later." },
            { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
        );
    }

    try {
        const subscriptions = await getActivePushSubscriptionDocsForUser(userDid);
        let accepted = 0;
        let revoked = 0;
        let failed = 0;

        for (const sub of subscriptions) {
            const outcome = await sendWebPushNotification(
                { endpoint: sub.endpoint, keys: sub.keys },
                {
                    title: "Kamooni",
                    body: "Push notifications are working on this device.",
                    url: "/",
                    tag: "kamooni-push-test",
                },
                { ttlSeconds: 300 },
            );

            if (outcome.outcome === "accepted") {
                accepted += 1;
            } else if (outcome.outcome === "permanent_revoke" && sub._id) {
                await revokePushSubscriptionById(sub._id, outcome.errorCode);
                revoked += 1;
            } else {
                failed += 1;
            }
        }

        return NextResponse.json({
            attempted: subscriptions.length,
            accepted,
            revoked,
            failed,
        });
    } catch (error) {
        console.error("Failed to send test push notification:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
