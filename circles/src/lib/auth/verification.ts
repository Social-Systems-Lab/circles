type VerificationSubject =
    | {
          isAdmin?: boolean;
          isVerified?: boolean;
          isHuman?: boolean;
          verificationStatus?: "unverified" | "pending" | "verified";
      }
    | null
    | undefined;

export function isVerifiedUser(user: VerificationSubject): boolean {
    return user?.verificationStatus === "verified" || user?.isVerified === true;
}

export function canBypassVerificationRestrictions(user: VerificationSubject): boolean {
    return user?.isAdmin === true;
}

export function canPerformRestrictedAction(user: VerificationSubject): boolean {
    return canBypassVerificationRestrictions(user) || isVerifiedUser(user);
}

// Tier 1: can the user participate at all (human-verified OR admin-verified OR admin)?
export function canInteract(user: VerificationSubject): boolean {
    return user?.isHuman === true || canPerformRestrictedAction(user);
}

export function getRestrictedActionMessage(action: string): string {
    return `You need to verify your account before you can ${action}.`;
}

export function getInteractionRequiredMessage(action: string): string {
    return `You need to complete human verification before you can ${action}.`;
}

export function buildVerifiedUserSet(
    verifierDid: string,
    now: Date = new Date(),
): {
    isVerified: true;
    verificationStatus: "verified";
    verifiedAt: Date;
    verifiedBy: string;
} {
    return {
        isVerified: true,
        verificationStatus: "verified",
        verifiedAt: now,
        verifiedBy: verifierDid,
    };
}

export function buildUnverifiedUserUpdate(): {
    $set: {
        isVerified: false;
        verificationStatus: "unverified";
    };
    $unset: {
        verifiedAt: "";
        verifiedBy: "";
    };
} {
    return {
        $set: {
            isVerified: false,
            verificationStatus: "unverified",
        },
        $unset: {
            verifiedAt: "",
            verifiedBy: "",
        },
    };
}
