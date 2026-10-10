export const arePaymentsEnabled = (value: string | undefined = process.env.PAYMENTS_ENABLED): boolean =>
    value !== "false";

export function assertPaymentsEnabled(): void {
    if (!arePaymentsEnabled()) {
        throw new Error("Payments are disabled in this environment");
    }
}

export function assertDonorboxCredentialsConfigured(username?: string, apiKey?: string): void {
    if (!username || !apiKey) throw new Error("Donorbox credentials are not configured");
}
