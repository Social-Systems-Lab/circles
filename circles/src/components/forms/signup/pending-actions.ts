"use server";

import { headers, cookies } from "next/headers";
import { verifyAltchaPayload } from "@/lib/auth/altcha";
import {
    beginPendingRegistration,
    correctPendingRegistrationEmail,
    isPendingRegistrationEnabled,
    provisionPendingRegistration,
    resendPendingRegistrationVerification,
    resumePendingRegistration,
} from "@/lib/auth/pending-registration";
import { createPendingRegistrationRuntimeDependencies } from "@/lib/auth/pending-registration-runtime";
import { assertRegistrationMode } from "@/lib/auth/registration-routing";
import { authorizePendingRegistrationChallenge } from "@/lib/auth/pending-registration";

const GENERIC = "If registration can continue, we sent an email with the next step.";
const PENDING_COOKIE = "__Host-kamooni-pending-registration";
const VERIFIED_COOKIE = "__Host-kamooni-verified-registration";

async function trustedRequest(): Promise<{ ok: boolean; clientIp: string }> {
    const requestHeaders = await headers();
    const origin = requestHeaders.get("origin");
    const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host");
    const proto = requestHeaders.get("x-forwarded-proto") || "https";
    if (!origin || !host) return { ok: false, clientIp: "missing-origin" };
    try {
        const parsed = new URL(origin);
        if (parsed.host !== host || parsed.protocol !== `${proto}:`) return { ok: false, clientIp: "invalid-origin" };
    } catch {
        return { ok: false, clientIp: "invalid-origin" };
    }
    return { ok: true, clientIp: requestHeaders.get("x-real-ip")?.trim() || "missing-x-real-ip" };
}

async function activeDependencies() {
    if (!isPendingRegistrationEnabled()) return null;
    await assertRegistrationMode("pending");
    return createPendingRegistrationRuntimeDependencies();
}

export async function startPendingRegistrationAction(input: {
    name: string;
    email: string;
    requestedHandle: string;
    redirectTo?: string;
    altcha: string;
}) {
    const request = await trustedRequest();
    if (!request.ok) return { success: false, message: GENERIC };
    try {
        if (!isPendingRegistrationEnabled()) return { success: false, message: GENERIC };
        const deps = await activeDependencies();
        if (!deps) return { success: false, message: GENERIC };
        if (!(await authorizePendingRegistrationChallenge(request.clientIp, deps))) {
            return { success: true, message: GENERIC };
        }
        const result = await beginPendingRegistration({ ...input, clientIp: request.clientIp }, deps, {
            enabled: true,
            verifyAltcha: verifyAltchaPayload,
        });
        if (!result.enabled) return { success: false, message: GENERIC };
        const jar = await cookies();
        jar.set(PENDING_COOKIE, `${result.pendingRegistrationId}.${result.continuationSecret}`, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            path: "/",
            maxAge: 48 * 60 * 60,
        });
        const state = await resumePendingRegistration(result.pendingRegistrationId, result.continuationSecret, deps);
        return {
            success: true,
            message: GENERIC,
            email: state.email,
            status: state.status,
            resendAvailableAt: state.verificationLastSentAt
                ? new Date(state.verificationLastSentAt.getTime() + 60_000).toISOString()
                : null,
            redirectTo: state.redirectTo || null,
        };
    } catch {
        return { success: false, message: GENERIC };
    }
}

export async function resendPendingRegistrationAction() {
    return pendingMutation("resend");
}

export async function correctPendingRegistrationEmailAction(newEmail: string) {
    return pendingMutation("correct", newEmail);
}

async function pendingMutation(kind: "resend" | "correct", newEmail?: string) {
    const request = await trustedRequest();
    if (!request.ok) return { success: true, message: GENERIC };
    try {
        const deps = await activeDependencies();
        const capability = await getPendingCookie(PENDING_COOKIE);
        if (!deps || !capability) return { success: true, message: GENERIC };
        if (kind === "resend") {
            return await resendPendingRegistrationVerification({ ...capability, clientIp: request.clientIp }, deps);
        }
        return await correctPendingRegistrationEmail(
            { ...capability, newEmail: newEmail || "", clientIp: request.clientIp },
            deps,
        );
    } catch {
        return { success: true, message: GENERIC };
    }
}

export async function resumePendingRegistrationAction() {
    const request = await trustedRequest();
    if (!request.ok) return { success: false, message: GENERIC };
    try {
        const deps = await activeDependencies();
        const capability = await getPendingCookie(PENDING_COOKIE);
        if (!deps || !capability) return { success: false, message: GENERIC };
        const result = await resumePendingRegistration(
            capability.pendingRegistrationId,
            capability.continuationSecret,
            deps,
        );
        return result.success
            ? {
                  success: true,
                  status: result.status,
                  email: result.email,
                  redirectTo: result.redirectTo || null,
                  resendAvailableAt: result.verificationLastSentAt
                      ? new Date(result.verificationLastSentAt.getTime() + 60_000).toISOString()
                      : null,
              }
            : { success: false, message: GENERIC };
    } catch {
        return { success: false, message: GENERIC };
    }
}

export async function completePendingRegistrationAction(password: string) {
    const request = await trustedRequest();
    if (!request.ok) return { success: false, message: GENERIC };
    try {
        const deps = await activeDependencies();
        const jar = await cookies();
        const value = jar.get(VERIFIED_COOKIE)?.value;
        const parsed = value?.split(".");
        if (!deps || !parsed || parsed.length !== 2) return { success: false, message: GENERIC };
        const authorized = await resumePendingRegistration(parsed[0], parsed[1], deps);
        if (!authorized.success || authorized.status !== "email_verified") return { success: false, message: GENERIC };
        const redirectTo = authorized.redirectTo || "/onboarding";
        const safeRedirect = redirectTo.startsWith("/") && !redirectTo.startsWith("//") ? redirectTo : "/onboarding";
        const result = await provisionPendingRegistration(
            { pendingRegistrationId: parsed[0], verifiedContinuationSecret: parsed[1], password },
            deps,
        );
        if (result.success) jar.delete(VERIFIED_COOKIE);
        return { success: result.success, message: result.message, redirectTo: result.success ? safeRedirect : null };
    } catch {
        return { success: false, message: GENERIC };
    }
}

async function getPendingCookie(cookieName: string) {
    const value = (await cookies()).get(cookieName)?.value;
    const parts = value?.split(".");
    return parts?.length === 2 ? { pendingRegistrationId: parts[0], continuationSecret: parts[1] } : null;
}
