import { z } from "zod";

export const didSchema = z.string().regex(/^[0-9a-fA-F]{64}$/, "DID must be a 64-character hexadecimal string");
export const passwordSchema = z.string().min(8, { message: "Password must be at least 8 characters long" });
export const handleSchema = z
    .string()
    .min(1, { message: "Handle must be at least 1 character long" })
    .max(20, { message: "Handle can't be more than 20 characters long" })
    .regex(/^[a-zA-Z0-9_]+$/, { message: "Handle can only contain letters, numbers and underscores." });

export const userSchema = z.object({
    did: didSchema.optional(),
    name: z.string().default("Anonymous User"),
    handle: handleSchema,
    picture: z.string().optional(),
    cover: z.string().optional(),
});

export type User = z.infer<typeof userSchema>;

export const circleSchema = z.object({
    did: didSchema.optional(),
    name: z.string().default("Untitled Circle"),
    handle: handleSchema,
    picture: z.string().optional(),
    cover: z.string().optional(),
});

export type Circle = z.infer<typeof circleSchema>;

export const serverConfigSchema = z.object({
    defaultCircleDid: z.string().optional(),
    status: z.enum(["setup", "online"]),
});

export type ServerConfig = z.infer<typeof serverConfigSchema>;
