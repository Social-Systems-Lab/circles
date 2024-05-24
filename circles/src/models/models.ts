import { CoreMessage } from "ai";
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
    setup_status: z.enum(["config", "account", "circle", "complete"]),
    mapboxKey: z.string().optional(),
    openaiKey: z.string().optional(),
});

export type ServerConfig = z.infer<typeof serverConfigSchema>;

// server setup form wizard

export const serverSetupDataSchema = z.object({
    openaiKey: z.string().trim(),
    mapboxKey: z.string().trim(),
});

export type ServerSetupData = z.infer<typeof serverSetupDataSchema>;

export const openAIFormSchema = z.object({
    openaiKey: z.string().trim().min(8, { message: "Enter valid OpenAI API key" }),
});

export type OpenAIFormType = z.infer<typeof openAIFormSchema>;

export const mapboxFormSchema = z.object({
    mapboxKey: z.string().trim().min(8, { message: "Enter valid Mapbox API key" }),
});

export type MapboxFormType = z.infer<typeof mapboxFormSchema>;

// login form wizard

export const loginDataSchema = z.object({
    email: z.string().email({
        message: "Enter valid email",
    }),
    aiEnabled: z.boolean().default(false),
    password: passwordSchema.optional(),
});

export type LoginData = z.infer<typeof loginDataSchema>;

export const emailFormSchema = z.object({
    email: z.string().email({
        message: "Enter valid email",
    }),
});

export type EmailFormType = z.infer<typeof emailFormSchema>;

export const passwordFormSchema = z.object({
    password: passwordSchema,
});

export type PasswordFormType = z.infer<typeof passwordFormSchema>;

export type Message = {
    coreMessage: CoreMessage;
    options?: string[];
};

export const registrationFormSchema = z.object({
    type: z.enum(["user", "organization"]).describe("Account type"),
    name: z.string().describe("User's name, nickname or if organization the organization's name"),
    email: z.string().email().describe("Email address"),
    password: passwordSchema.describe("Password"),
    handle: handleSchema.describe(
        "Unique handle that will identify the account on the platform, e.g. a nickname or organisation name. May consist of lowercase letters, numbers and underscore."
    ),
    description: z.string().optional().describe("Short description of the user or organization"),
    picture: z.string().optional().describe("URL to profile picture"),
    cover: z.string().optional().describe("URL to cover picture"),
    content: z.string().optional().describe("Profile content that describes the user or organization in more detail"),
});

export type InputProvider = {
    type: "input-provider";
    inputType: "options" | "password" | "date-picker" | "file-upload";
    //data: MultipleChoiceData | PasswordData | TextData | DatePickerData | FileUploadData;
    data: any;
};

export type FormData = {
    type: "form-data";
    data: any;
};

export type StreamableValue = string | InputProvider | FormData;
