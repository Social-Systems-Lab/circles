import { z } from "zod";

export const serverSchema = z.object({
    did: z.string(),
    name: z.string(),
    url: z.string().url(),
    publicKey: z.string(),
    registeredAt: z.date().optional(),
});

export type Server = z.infer<typeof serverSchema>;

export const challengeSchema = z.object({
    did: z.string(),
    name: z.string(),
    url: z.string().url(),
    publicKey: z.string(),
    serverId: z.string(),
    challenge: z.string(),
    expiresAt: z.date(),
});

export type Challenge = z.infer<typeof challengeSchema>;

export const registrationRequestSchema = z.object({
    did: z.string(),
    name: z.string(),
    url: z.string().url(),
    publicKey: z.string(),
});

export const registrationConfirmSchema = z.object({
    did: z.string(),
    challenge: z.string(),
    signature: z.string(),
});
