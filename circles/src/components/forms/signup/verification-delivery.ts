export type VerificationEmailStatus = "sent" | "failed" | undefined;

export function getSignupDeliveryNotice(
    status: VerificationEmailStatus,
    successDescription: string,
): { title: string; description: string; deliveryFailed: boolean } {
    if (status === "failed") {
        return {
            title: "Account created — verification unavailable",
            description: "We could not send your verification link. Retry from your account settings.",
            deliveryFailed: true,
        };
    }
    return { title: "Account created", description: successDescription, deliveryFailed: false };
}
