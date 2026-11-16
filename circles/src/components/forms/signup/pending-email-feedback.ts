export const PENDING_RESEND_DELIVERY_FAILED_MESSAGE =
    "We couldn’t send another verification email. Your signup is saved; please wait a moment and try again.";

export const PENDING_CORRECTION_DELIVERY_FAILED_MESSAGE =
    "We saved your corrected email, but couldn’t send the verification message. Please wait a moment and try again, or contact support.";

export const PENDING_CORRECTION_NOT_SAVED_MESSAGE =
    "We couldn’t update that address yet. Check it and try again, or wait before retrying.";

export function pendingResendMessage(deliveryFailed: boolean | undefined): string {
    return deliveryFailed
        ? PENDING_RESEND_DELIVERY_FAILED_MESSAGE
        : "If this signup can continue, a fresh verification link will arrive shortly.";
}

export function pendingCorrectionMessage({
    emailUpdated,
    deliveryFailed,
}: {
    emailUpdated: boolean;
    deliveryFailed: boolean | undefined;
}): string {
    if (!emailUpdated) return PENDING_CORRECTION_NOT_SAVED_MESSAGE;
    return deliveryFailed
        ? PENDING_CORRECTION_DELIVERY_FAILED_MESSAGE
        : "If this signup can continue, a new verification link will arrive shortly.";
}
