import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserDid } from "@/lib/auth/auth";
import { assertSameOriginMutation } from "@/lib/push/csrf";
import {
    getNotificationPreferencesForUser,
    parseNotificationPreferencesPatch,
    updateNotificationPreferencesForUser,
} from "@/lib/push/preferences";
import { pushMutationRateLimiter } from "@/lib/push/rate-limit";
import { readJsonBodyLimited } from "@/lib/security/bounded-input";

const MAX_PREFERENCES_BODY_BYTES = 4 * 1024;

export async function GET() {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const preferences = await getNotificationPreferencesForUser(userDid);
        if (!preferences) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        return NextResponse.json(preferences, {
            headers: { "Cache-Control": "no-store" },
        });
    } catch (error) {
        console.error("Failed to load notification preferences:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export async function PATCH(req: NextRequest) {
    const csrf = assertSameOriginMutation(req);
    if (!csrf.ok) {
        return NextResponse.json({ error: csrf.error }, { status: csrf.status });
    }

    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rate = pushMutationRateLimiter.check(`notif-prefs:${userDid}`, 30, 10 * 60 * 1000);
    if (!rate.allowed) {
        return NextResponse.json(
            { error: "Too many preference updates. Please try again later." },
            { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
        );
    }

    const body = await readJsonBodyLimited(req, MAX_PREFERENCES_BODY_BYTES);
    if (!body.ok) {
        return NextResponse.json({ error: body.error }, { status: body.status });
    }

    const parsed = parseNotificationPreferencesPatch(body.value);
    if (!parsed.ok) {
        return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    try {
        const updated = await updateNotificationPreferencesForUser(userDid, parsed.value);
        if (!updated) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        return NextResponse.json(updated);
    } catch (error) {
        console.error("Failed to update notification preferences:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
