import { Toast } from "@/components/ui/use-toast";
import { CoreMessage } from "ai";
import { read } from "fs";
import { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { ReadonlyURLSearchParams } from "next/navigation";
import { z } from "zod";

export const didSchema = z.string().regex(/^[0-9a-fA-F]{64}$/, "DID must be a 64-character hexadecimal string");
export const passwordSchema = z.string().min(8, { message: "Password must be at least 8 characters long" });
export const handleSchema = z
    .string()
    .max(20, { message: "Handle can't be more than 20 characters long" })
    .regex(/^[a-zA-Z0-9_]*$/, { message: "Handle can only contain letters, numbers and underscores." });

export const accountTypeSchema = z.enum(["user", "organization"]);
export const emailSchema = z.string().email({ message: "Enter valid email" });

const DEFAULT_MAX_IMAGE_FILE_SIZE = 5000000; // 5MB
const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];

export const getImageSchema = (maxSize?: number) => {
    let maxImageSize = maxSize ?? DEFAULT_MAX_IMAGE_FILE_SIZE;
    return z
        .any()
        .refine(
            (file) => !file?.size || file?.size <= maxImageSize,
            `Max image size is ${maxImageSize / 1000 / 1000}MB.`,
        )
        .refine(
            (file) => !file?.type || ACCEPTED_IMAGE_TYPES.includes(file?.type),
            "Only .jpg, .jpeg, .png and .webp image formats are supported.",
        );
};

export type AccountType = z.infer<typeof accountTypeSchema>;

export const userSchema = z.object({
    did: didSchema,
    type: accountTypeSchema.default("user"),
    name: z.string().default("Anonymous User"),
    email: z.string().email(),
    handle: handleSchema,
    picture: z.string().optional(),
    cover: z.string().optional(),
});

export type User = z.infer<typeof userSchema>;

export const userGroupSchema = z.object({
    name: z.string(),
    handle: handleSchema,
    title: z.string(),
    description: z.string(),
    readOnly: z.boolean().optional(),
});

export type UserGroup = z.infer<typeof userGroupSchema>;

export const featureSchema = z.object({
    name: z.string(),
    handle: handleSchema,
    description: z.string(),
    defaultUserGroups: z.array(z.string()).optional(),
});

export type Feature = z.infer<typeof featureSchema>;

export const moduleSchema = z.object({
    name: z.string(),
    handle: handleSchema,
    description: z.string(),
    component: z.any(),
    layoutComponent: z.any().optional(),
    features: z.array(z.string()).optional(),
});

export type Module = z.infer<typeof moduleSchema>;

// access rules are a map of features to array of user groups that are granted access to the feature
export const accessRulesSchema = z.record(z.string(), z.array(z.string()));

export const pageSchema = z.object({
    name: z.string(),
    handle: handleSchema,
    description: z.string(),
    //accessRules: pageAccessRulesSchema.optional(),
    module: z.string(),
    readOnly: z.boolean().optional(),
});

export type Page = z.infer<typeof pageSchema>;

export const fileInfoSchema = z.object({
    originalName: z.string().optional(),
    fileName: z.string().optional(),
    url: z.string(),
});

export const circleSchema = z.object({
    _id: z.string().optional(),
    did: didSchema.optional(),
    name: z.string().default("Circles").optional(),
    handle: handleSchema.optional(),
    picture: fileInfoSchema.optional(),
    cover: fileInfoSchema.optional(),
    description: z.string().optional(),
    userGroups: z.array(userGroupSchema).default([]).optional(),
    pages: z.array(pageSchema).default([]).optional(),
    accessRules: accessRulesSchema.optional(),
});

export type Circle = z.infer<typeof circleSchema>;

export const serverConfigSchema = z.object({
    defaultCircleId: z.string().optional(),
    status: z.enum(["setup", "online"]),
    setupStatus: z.enum(["config", "account", "complete"]),
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
    inputProvider?: InputProvider;
    toolCall?: boolean;
    suggestion?: string;
};

export type InputProvider = {
    type: "input-provider";
    inputType: "suggestions" | "none";
    //data: MultipleChoiceData | PasswordData | TextData | DatePickerData | FileUploadData;
    data?: any;
};

export type FormData = {
    type: "form-data";
    data: any;
};

export type SwitchContext = {
    type: "switch-context";
    contextId: string;
};

export type AddedMessages = {
    type: "added-messages";
    messages: Message[];
};

export type AuthData = {
    type: "auth-data";
    user: User;
    token: string;
};

export type StreamableValue = string | InputProvider | FormData | SwitchContext | AddedMessages | AuthData;

export type AvailableContext = {
    id: string;
    switchReason: string;
};

export type ContextInfo = {
    currentContextId: string;
    contextId: string;
    formData: any;
    context: AiContext;
    stream: any;
    messages: Message[];
};

export type AiContext = {
    id: string;
    title: string;
    intent: string;
    description: string;
    formSchema?: string;
    defaultStep?: number;
    instructions?: string;
    prompt?: string;
    steps: AiStep[];
    availableContexts: AvailableContext[];
    icon: string;
};

export type AiContextTool = (c: ContextInfo) => any;

export type AiStep = {
    stepNumber: number;
    description: string;
    instructions?: string;
    prompt?: string;
    nextStep?: number;
    inputProvider?: InputProvider;
    generateInputProviderInstructions?: string;
};

// dynamic-forms

export type FormFieldOption = {
    value: string;
    label: string;
};

export type FormFieldType =
    | "text"
    | "textarea"
    | "image"
    | "array"
    | "table"
    | "hidden"
    | "email"
    | "password"
    | "select"
    | "handle"
    | "access-rules";

export type FormField = {
    name: string;
    label: string;
    type: FormFieldType;
    placeholder?: string;
    autoComplete?: string;
    description?: string;
    options?: FormFieldOption[];
    minLength?: number;
    maxLength?: number;
    required?: boolean;
    validationMessage?: string;
    imageMaxSize?: number;
    imagePreviewWidth?: number;
    imagePreviewHeight?: number;
    itemSchema?: FormSchema;
    showInHeader?: boolean;
    ensureUniqueField?: string;
};

export type FormSchema = {
    id: string;
    title: string;
    description: string;
    footer?: {
        text: string;
        link: { href: string; text: string };
    };
    button: {
        text: string;
    };
    fields: FormField[];
};

export type FormSubmitResponse = {
    message?: string;
    success: boolean;
    data?: any;
};

export type FormAction = {
    id: string;
    onSubmit: (values: Record<string, any>, page?: Page, subpage?: string) => Promise<FormSubmitResponse>;
};

export type FormActionHandler = {
    id: string;
    onHandleSubmit: (
        response: FormSubmitResponse,
        router: AppRouterInstance,
        tools: FormTools,
    ) => Promise<FormSubmitResponse>;
};

export type FormTools = {
    user?: User;
    setUser: (user: User) => void;
    authenticated?: boolean;
    setAuthenticated: (authenticated: boolean) => void;
    searchParams: ReadonlyURLSearchParams;
    toast: ({ ...props }: Toast) => void;
};
