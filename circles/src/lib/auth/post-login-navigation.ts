import { resumableOnboardingStateSchema, type Circle } from "@/models/models";

type PostLoginUser = Pick<Partial<Circle>, "handle" | "metadata" | "onboardingState"> | null | undefined;

const AUTH_ROUTE_PREFIXES = [
    "/login",
    "/signup",
    "/forgot-password",
    "/reset-password",
    "/verify-email",
    "/logout",
    "/logged-out",
    "/unauthenticated",
    "/unauthorized",
] as const;

export function validateInternalLoginRedirect(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.includes("\\")) return null;
    if (/[\u0000-\u001f\u007f]/.test(trimmed)) return null;

    try {
        const parsed = new URL(trimmed, "https://kamooni.invalid");
        if (parsed.origin !== "https://kamooni.invalid") return null;
        const decodedPath = decodeURIComponent(parsed.pathname);
        if (decodedPath.startsWith("//") || decodedPath.includes("\\") || /[\u0000-\u001f\u007f]/.test(decodedPath)) {
            return null;
        }
        if (AUTH_ROUTE_PREFIXES.some((route) => decodedPath === route || decodedPath.startsWith(`${route}/`))) {
            return null;
        }
        return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    } catch {
        return null;
    }
}

const profileFallback = (user: PostLoginUser): string =>
    typeof user?.handle === "string" && user.handle.trim()
        ? `/circles/${encodeURIComponent(user.handle.trim())}`
        : "/explore";

export function resolvePostLoginRedirect(user: PostLoginUser, requestedRedirect?: unknown): string {
    const explicitRedirect = validateInternalLoginRedirect(requestedRedirect);
    if (explicitRedirect) return explicitRedirect;

    const fallback = profileFallback(user);
    if (user?.metadata?.onboardingFlow !== "pending-registration-v1") return fallback;

    const state = user.onboardingState;
    if (!state) return "/onboarding";
    const parsedState = resumableOnboardingStateSchema.safeParse(state);
    if (!parsedState.success) return fallback;
    if (parsedState.data.completionAcknowledgedAt) return fallback;
    return "/onboarding";
}
