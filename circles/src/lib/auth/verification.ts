type VerificationSubject =
    | {
          isAdmin?: boolean;
          isVerified?: boolean;
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

export function getRestrictedActionMessage(action: string): string {
    return `You need to verify your account before you can ${action}.`;
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
