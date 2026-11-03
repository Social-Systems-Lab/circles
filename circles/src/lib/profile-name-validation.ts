import { z } from "zod";

export const personalProfileDisplayNameSchema = z
    .string()
    .trim()
    .min(2, "Enter your name (2–100 characters).")
    .max(100, "Enter your name (2–100 characters).");

export type PersonalProfileDisplayNameValidation = { valid: true; name: string } | { valid: false; message: string };

export function validatePersonalProfileDisplayName(value: unknown): PersonalProfileDisplayNameValidation {
    const result = personalProfileDisplayNameSchema.safeParse(value);
    return result.success
        ? { valid: true, name: result.data }
        : { valid: false, message: result.error.issues[0]?.message ?? "Enter your name (2–100 characters)." };
}

export function validatePersonalProfileDisplayNameField(value: unknown): true | string {
    const result = validatePersonalProfileDisplayName(value);
    return result.valid ? true : result.message;
}
