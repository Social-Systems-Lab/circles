import { z } from "zod";

export const didSchema = z.string().regex(/^[0-9a-fA-F]{64}$/, "DID must be a 64-character hexadecimal string");
export const passwordSchema = z.string().min(8, { message: "Password must be at least 8 characters long" });
export const handleSchema = z
    .string()
    .max(20, { message: "Handle can't be more than 20 characters long" })
    .regex(/^[a-zA-Z0-9_]*$/, { message: "Handle can only contain letters, numbers and underscores." });
export const emailSchema = z.string().email({ message: "Enter valid email" });

export const serverSchema = z.object({
    did: didSchema,
    name: z.string(),
    url: z.string().url(),
    publicKey: z.string(),
    registeredAt: z.date().optional(),
    updatedAt: z.date().optional(),
});

export type Server = z.infer<typeof serverSchema>;

export const serverChallengeSchema = z.object({
    did: didSchema,
    name: z.string(),
    url: z.string().url(),
    publicKey: z.string(),
    challenge: z.string(),
    expiresAt: z.date(),
});

export type ServerChallenge = z.infer<typeof serverChallengeSchema>;

export const serverRegistrationRequestSchema = z.object({
    did: z.string(),
    name: z.string(),
    url: z.string().url(),
    publicKey: z.string(),
});

export const serverRegistrationConfirmSchema = z.object({
    did: z.string(),
    challenge: z.string(),
    signature: z.string(),
});

export const accountTypeSchema = z.enum(["user", "organization"]);
export type AccountType = z.infer<typeof accountTypeSchema>;

export const userSchema = z.object({
    did: didSchema,
    name: z.string(),
    email: emailSchema,
    handle: handleSchema,
    type: accountTypeSchema,
    homeServerDid: didSchema.optional(),
    picture: z.string().url().optional(),
    serverDids: z.array(didSchema).optional(),
    publicKey: z.string(),
    updatedAt: z.date().optional(),
    registeredAt: z.date().optional(),
});

export type User = z.infer<typeof userSchema>;

export const userChallengeSchema = z.object({
    did: didSchema,
    name: z.string(),
    email: emailSchema,
    handle: handleSchema,
    type: accountTypeSchema,
    picture: z.string().url().optional(),
    homeServerDid: didSchema.optional(),
    serverDid: didSchema.optional(),
    publicKey: z.string(),
    challenge: z.string(),
    expiresAt: z.date(),
});

export type UserChallenge = z.infer<typeof userChallengeSchema>;

export const userRegistrationRequestSchema = z.object({
    did: z.string(),
    name: z.string(),
    email: emailSchema,
    handle: handleSchema,
    type: accountTypeSchema,
    homeServerDid: didSchema.optional(),
    serverDid: didSchema.optional(),
    picture: z.string().url().optional(),
    publicKey: z.string(),
});

export const userRegistrationConfirmSchema = z.object({
    did: z.string(),
    challenge: z.string(),
    signature: z.string(),
});
