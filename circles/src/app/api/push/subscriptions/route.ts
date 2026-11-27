import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserDid } from "@/lib/auth/auth";
import { isWebPushEnabled } from "@/lib/push/config";
import { assertSameOriginMutation } from "@/lib/push/csrf";
import { pushMutationRateLimiter } from "@/lib/push/rate-limit";
import {
    listActivePushSubscriptionsForUser,
    revokePushSubscriptionForUser,
    upsertPushSubscription,
} from "@/lib/push/subscriptions";
import { validatePushEndpointUrl, validatePushSubscriptionPayload } from "@/lib/push/validation";
import { readJsonBodyLimited } from "@/lib/security/bounded-input";

const MAX_SUBSCRIPTION_BODY_BYTES = 8 * 1024;
const MAX_DELETE_BODY_BYTES = 4 * 1024;
const MUTATION_LIMIT = 20;
const MUTATION_WINDOW_MS = 10 * 60 * 1000;

export async function GET() {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const enabled = isWebPushEnabled();
    if (!enabled) {
        return NextResponse.json(
            { enabled: false, subscriptions: [] },
            { headers: { "Cache-Control": "no-store" } },
        );
    }

    try {
        const subscriptions = await listActivePushSubscriptionsForUser(userDid);
        return NextResponse.json(
            { enabled: true, subscriptions },
            { headers: { "Cache-Control": "no-store" } },
        );
    } catch (error) {
        console.error("Failed to list push subscriptions:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    if (!isWebPushEnabled()) {
        return NextResponse.json({ error: "Web Push is disabled" }, { status: 404 });
    }

    const csrf = assertSameOriginMutation(req);
    if (!csrf.ok) {
        return NextResponse.json({ error: csrf.error }, { status: csrf.status });
    }

    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rate = pushMutationRateLimiter.check(`push-sub-post:${userDid}`, MUTATION_LIMIT, MUTATION_WINDOW_MS);
    if (!rate.allowed) {
        return NextResponse.json(
            { error: "Too many push subscription updates. Please try again later." },
            { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
        );
    }

    const body = await readJsonBodyLimited(req, MAX_SUBSCRIPTION_BODY_BYTES);
    if (!body.ok) {
        return NextResponse.json({ error: body.error }, { status: body.status });
    }

    const validatedPayload = validatePushSubscriptionPayload(body.value);
    if (!validatedPayload.ok) {
        return NextResponse.json({ error: validatedPayload.error }, { status: 400 });
    }

    const endpointCheck = await validatePushEndpointUrl(validatedPayload.value.endpoint);
    if (!endpointCheck.ok) {
        return NextResponse.json({ error: endpointCheck.error }, { status: 400 });
    }

    try {
        const result = await upsertPushSubscription({
            userDid,
            endpoint: endpointCheck.url.toString(),
            keys: validatedPayload.value.keys,
            userAgentSummary: validatedPayload.value.userAgentSummary,
        });

        return NextResponse.json({
            subscriptionId: result.subscriptionId,
        });
    } catch (error) {
        console.error("Failed to save push subscription:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    const csrf = assertSameOriginMutation(req);
    if (!csrf.ok) {
        return NextResponse.json({ error: csrf.error }, { status: csrf.status });
    }

    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rate = pushMutationRateLimiter.check(`push-sub-delete:${userDid}`, MUTATION_LIMIT, MUTATION_WINDOW_MS);
    if (!rate.allowed) {
        return NextResponse.json(
            { error: "Too many push subscription updates. Please try again later." },
            { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
        );
    }

    const body = await readJsonBodyLimited(req, MAX_DELETE_BODY_BYTES);
    if (!body.ok) {
        return NextResponse.json({ error: body.error }, { status: body.status });
    }

    const endpoint =
        body.value && typeof body.value === "object" && !Array.isArray(body.value)
            ? (body.value as { endpoint?: unknown }).endpoint
            : undefined;

    if (typeof endpoint !== "string" || endpoint.trim().length === 0 || endpoint.length > 2048) {
        return NextResponse.json({ error: "Valid subscription endpoint is required" }, { status: 400 });
    }

    try {
        const result = await revokePushSubscriptionForUser({
            userDid,
            endpoint: endpoint.trim(),
            reason: "user_revoked",
        });
        return NextResponse.json({
            revoked: result.revoked,
            ...(result.subscriptionId ? { subscriptionId: result.subscriptionId } : {}),
        });
    } catch (error) {
        console.error("Failed to revoke push subscription:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
