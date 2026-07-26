import type { Circle } from "@/models/models";

export const EMAIL_VERIFICATION_RESEND_COOLDOWN_MS = 60 * 1000;
export const EMAIL_VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
export const EMAIL_VERIFICATION_SUCCESS_MESSAGE = "If verification is still needed, we sent a new verification email.";
export const EMAIL_VERIFICATION_COOLDOWN_MESSAGE =
    "A verification email was sent recently. Please wait before requesting another.";
export const EMAIL_VERIFICATION_PROVIDER_ERROR_MESSAGE =
    "We could not send the verification email. Please try again shortly.";

type ResendUser = Pick<
    Circle,
    "_id" | "did" | "email" | "handle" | "name" | "isEmailVerified" | "emailVerificationLastSentAt"
>;

export type ResendEmailVerificationResult = {
    success: boolean;
    status: "sent" | "cooldown" | "already_verified" | "unauthorized" | "error";
    message: string;
};

export type ResendEmailVerificationDeps = {
    getUserByDid: (userDid: string) => Promise<ResendUser | null | undefined>;
    sendEmail: (options: {
        to: string;
        templateAlias: string;
        templateModel: Record<string, unknown>;
    }) => Promise<void>;
    persistToken: (params: { userDid: string; hashedToken: string; expiresAt: Date; sentAt: Date }) => Promise<void>;
    generateToken: () => string;
    hashToken: (token: string) => string;
    getBaseUrl: () => string;
    now?: () => Date;
    logError?: (message: string, error: unknown) => void;
};

export const shouldShowEmailVerificationBanner = (user?: Pick<Circle, "isEmailVerified"> | null): boolean =>
    user?.isEmailVerified !== true;

export const getEmailVerificationSettingsHref = (handle?: string | null): string =>
    handle ? `/circles/${handle}/settings/subscription#email-verification` : "/circles";

const getUsableDate = (value: unknown): Date | null => {
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
        return null;
    }
    return value;
};

const normalizeBaseUrl = (url: string): string => url.replace(/\/+$/, "");

export async function resendEmailVerificationForAuthenticatedUser(
    userDid: string | undefined,
    deps: ResendEmailVerificationDeps,
): Promise<ResendEmailVerificationResult> {
    if (!userDid) {
        return { success: false, status: "unauthorized", message: "You need to be logged in to verify your email." };
    }

    const user = await deps.getUserByDid(userDid);
    if (!user?.email) {
        return { success: false, status: "error", message: EMAIL_VERIFICATION_PROVIDER_ERROR_MESSAGE };
    }

    if (user.isEmailVerified === true) {
        return { success: true, status: "already_verified", message: EMAIL_VERIFICATION_SUCCESS_MESSAGE };
    }

    const now = deps.now?.() ?? new Date();
    const lastSentAt = getUsableDate(user.emailVerificationLastSentAt);
    if (lastSentAt && now.getTime() - lastSentAt.getTime() < EMAIL_VERIFICATION_RESEND_COOLDOWN_MS) {
        return { success: false, status: "cooldown", message: EMAIL_VERIFICATION_COOLDOWN_MESSAGE };
    }

    const token = deps.generateToken();
    const hashedToken = deps.hashToken(token);
    const expiresAt = new Date(now.getTime() + EMAIL_VERIFICATION_TOKEN_TTL_MS);
    const verificationLink = `${normalizeBaseUrl(deps.getBaseUrl())}/verify-email?token=${token}`;

    try {
        await deps.sendEmail({
            to: user.email,
            templateAlias: "email-verification",
            templateModel: {
                name: user.name || "User",
                actionUrl: verificationLink,
            },
        });
    } catch (error) {
        deps.logError?.("Failed to send verification email.", error);
        return { success: false, status: "error", message: EMAIL_VERIFICATION_PROVIDER_ERROR_MESSAGE };
    }

    await deps.persistToken({
        userDid,
        hashedToken,
        expiresAt,
        sentAt: now,
    });

    return { success: true, status: "sent", message: EMAIL_VERIFICATION_SUCCESS_MESSAGE };
}
