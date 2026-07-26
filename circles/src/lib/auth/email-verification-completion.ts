import type { Circle } from "@/models/models";

type VerificationUser = Pick<
    Circle,
    "_id" | "did" | "handle" | "isEmailVerified" | "emailVerificationToken" | "emailVerificationTokenExpiry"
>;

export type VerifyEmailTokenResult = {
    success: boolean;
    message: string;
    handle?: string;
};

export type VerifyEmailTokenDeps = {
    hashToken: (token: string) => string;
    findUserByHashedToken: (hashedToken: string) => Promise<VerificationUser | null | undefined>;
    clearToken: (userId: unknown) => Promise<void>;
    markEmailVerified: (params: { userId: unknown; hashedToken: string; now: Date }) => Promise<boolean>;
    now?: () => Date;
    warn?: (message: string) => void;
};

const getUsableExpiry = (value: unknown): Date | null => {
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
        return null;
    }
    return value;
};

export async function verifyEmailToken(token: string, deps: VerifyEmailTokenDeps): Promise<VerifyEmailTokenResult> {
    if (!token) {
        return { success: false, message: "Verification token is missing." };
    }

    const hashedToken = deps.hashToken(token);
    const user = await deps.findUserByHashedToken(hashedToken);

    if (!user) {
        return { success: false, message: "Invalid or expired verification token." };
    }

    if (user.isEmailVerified) {
        await deps.clearToken(user._id);
        return {
            success: false,
            message: "This email verification link has already been used. You can log in.",
            handle: user.handle || undefined,
        };
    }

    const now = deps.now?.() ?? new Date();
    const expiresAt = getUsableExpiry(user.emailVerificationTokenExpiry);
    if (!expiresAt || now >= expiresAt) {
        await deps.clearToken(user._id);
        return { success: false, message: "This email verification link has expired. Please request a new one." };
    }

    if (!user.did) {
        return { success: false, message: "Could not verify this account. Please contact support." };
    }

    const didUpdate = await deps.markEmailVerified({
        userId: user._id,
        hashedToken,
        now,
    });

    if (!didUpdate) {
        deps.warn?.(`Failed to update email verification status for user ${String(user._id)}, but token was valid.`);
        return { success: false, message: "Could not update email verification status. Please try again." };
    }

    return {
        success: true,
        message: "Email verified",
        handle: user.handle || undefined,
    };
}
