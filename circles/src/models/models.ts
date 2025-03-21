import { Toast } from "@/components/ui/use-toast";
import { CoreMessage } from "ai";
import { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { ReadonlyURLSearchParams } from "next/navigation";
import { z } from "zod";

export const didSchema = z.string(); //.regex(/^[0-9a-fA-F]{64}$/, "DID must be a 64-character hexadecimal string");
export const passwordSchema = z.string().min(8, { message: "Password must be at least 8 characters long" });
export const handleSchema = z
    .string()
    .max(20, { message: "Handle can't be more than 20 characters long" })
    .regex(/^[a-zA-Z0-9\-]*$/, { message: "Handle can only contain letters, numbers and hyphens (-)." });

export const accountTypeSchema = z.enum(["user", "organization"]);
export const circleTypeSchema = z.enum(["user", "circle"]);
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

export const fileInfoSchema = z.object({
    originalName: z.string().optional(),
    fileName: z.string().optional(),
    url: z.string(),
});

export type FileInfo = z.infer<typeof fileInfoSchema>;

export const registryInfoSchema = z.object({
    registeredAt: z.date().optional(),
    registryUrl: z.string().optional(),
});

export const lngLatSchema = z.object({
    lng: z.number(),
    lat: z.number(),
});

export type LngLat = z.infer<typeof lngLatSchema>;

export const locationSchema = z.object({
    precision: z.number(),
    country: z.string().optional(),
    region: z.string().optional(),
    city: z.string().optional(),
    street: z.string().optional(),
    lngLat: lngLatSchema.optional(),
});

export type Location = z.infer<typeof locationSchema>;

export type RegistryInfo = z.infer<typeof registryInfoSchema>;

export type AccountType = z.infer<typeof accountTypeSchema>;

export type CircleType = z.infer<typeof circleTypeSchema>;

export const memberSchema = z.object({
    _id: z.any().optional(),
    userDid: z.string(),
    circleId: z.string(),
    userGroups: z.array(z.string()).optional(),
    joinedAt: z.date().optional(),
    questionnaireAnswers: z.record(z.string(), z.string()).optional(),
});

export type Member = z.infer<typeof memberSchema>;

export type Membership = {
    circleId: string;
    userGroups: string[];
    joinedAt: Date;
    circle: Circle;
    questionnaireAnswers?: Record<string, string>;
};

export type ChatRoomMembership = ChatRoomMember & {
    chatRoom: ChatRoomDisplay;
};

export interface UserPrivate extends Circle {
    memberships: Membership[];
    friends: Membership[]; // followers
    pendingRequests: MembershipRequest[];
    chatRoomMemberships: ChatRoomMembership[];
    matrixUrl?: string;
    fullMatrixName?: string;
}

export type Partial<T> = {
    [P in keyof T]?: T[P];
};

export interface MemberDisplay extends Member {
    name: string;
    picture: FileInfo;
    cover?: FileInfo;
    location?: Location;
    description?: string;
    members?: number;
    circleType?: CircleType;
    handle?: string;
    metrics?: Metrics;
}

export const membershipRequestSchema = z.object({
    _id: z.any().optional(),
    userDid: didSchema,
    circleId: z.string(),
    status: z.enum(["pending", "approved", "rejected"]),
    requestedAt: z.date(),
    rejectedAt: z.date().optional(),
    approvedAt: z.date().optional(),
    name: z.string().optional(),
    email: z.string().optional(),
    picture: z.string().optional(),
    questionnaireAnswers: z.record(z.string(), z.string()).optional(),
});

export type MembershipRequest = z.infer<typeof membershipRequestSchema>;

export const userGroupSchema = z.object({
    name: z.string(),
    handle: handleSchema,
    title: z.string(),
    description: z.string(),
    accessLevel: z.number(),
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
    excludeFromMenu: z.boolean().optional(),
    defaultIcon: z.string().optional(),
});

export type Module = z.infer<typeof moduleSchema>;

export const feedSchema = z.object({
    _id: z.any().optional(),
    name: z.string(),
    handle: handleSchema,
    circleId: z.string(),
    createdAt: z.date(),
    userGroups: z.array(z.string()).default([]),
});

export type Feed = z.infer<typeof feedSchema>;

export const mediaSchema = z.object({
    name: z.string(),
    type: z.string(),
    fileInfo: fileInfoSchema,
});

export type Media = z.infer<typeof mediaSchema>;

export const mentionSchema = z.object({
    type: z.enum(["circle"]),
    id: z.string(),
});

export type Mention = z.infer<typeof mentionSchema>;

export interface MentionDisplay extends Mention {
    circle?: Circle;
}

export const postSchema = z.object({
    _id: z.any().optional(),
    feedId: z.string(),
    createdBy: didSchema,
    createdAt: z.date(),
    editedAt: z.date().optional(),
    content: z.string(),
    reactions: z.record(z.string(), z.number()).default({}),
    location: locationSchema.optional(),
    media: z.array(mediaSchema).optional(),
    highlightedCommentId: z.string().optional(),
    comments: z.number().default(0),
    mentions: z.array(mentionSchema).optional(),
});

export type Post = z.infer<typeof postSchema>;

export interface PostDisplay extends WithMetric<Post> {
    author: Circle;
    highlightedComment?: CommentDisplay;
    circleType: "post";
    userReaction?: string;
    mentionsDisplay?: MentionDisplay[];
    handle?: string;
    circle?: Circle;
    feed?: Feed;
}

export const commentSchema = z.object({
    _id: z.any().optional(),
    postId: z.string(),
    parentCommentId: z.string().nullable(), // Null for root-level comments
    content: z.string(),
    createdBy: didSchema,
    createdAt: z.date(),
    reactions: z.record(z.string(), z.number()).default({}),
    replies: z.number().default(0),
    isDeleted: z.boolean().optional(),
    mentions: z.array(mentionSchema).optional(),
});

export type Comment = z.infer<typeof commentSchema>;

export interface CommentDisplay extends Comment {
    author: Circle;
    userReaction?: string;
    rootParentId?: string;
    mentionsDisplay?: MentionDisplay[];
}

export const reactionSchema = z.object({
    _id: z.any().optional(),
    contentId: z.string(), // ID of the post or comment
    contentType: z.enum(["post", "comment", "chatMessage"]),
    userDid: didSchema,
    reactionType: z.string(),
    createdAt: z.date(),
});

export type Reaction = z.infer<typeof reactionSchema>;

export const chatRoomSchema = z.object({
    _id: z.any().optional(),
    matrixRoomId: z.string().optional(),
    name: z.string(),
    handle: handleSchema,
    circleId: z.string().optional(),
    createdAt: z.date(),
    userGroups: z.array(z.string()).default([]),
    picture: fileInfoSchema.optional(),
    isDirect: z.boolean().optional(),
    dmParticipants: z.array(z.string()).optional(),
});

export type ChatRoom = z.infer<typeof chatRoomSchema>;

export type ChatRoomDisplay = ChatRoom & {
    circle: Circle;
};

export type MatrixMessageContent =
    | {
          msgtype: "m.text";
          body: string;
          format?: string;
          formatted_body?: string;
      }
    | {
          msgtype: "m.image" | "m.file" | "m.audio" | "m.video";
          body: string;
          url: string;
          info?: Record<string, any>;
      }
    | {
          msgtype: "m.notice" | "m.emote";
          body: string;
          format?: string;
          formatted_body?: string;
      }
    | Record<string, unknown>; // Catch-all for other message types.

export interface ChatMessage {
    id: string; // Matrix event_id
    roomId: string; // Matrix room_id
    createdBy: string; // Matrix sender
    createdAt: Date; // Timestamp (Matrix origin_server_ts)
    content: MatrixMessageContent; // Matrix event content
    type: string; // Matrix event type
    stateKey?: string; // Optional for state events
    unsigned?: Record<string, unknown>; // Unsigned fields from Matrix
    author: Circle; // User data from your database
}

export const causeSchema = z.object({
    _id: z.any().optional(),
    handle: handleSchema,
    name: z.string(),
    picture: fileInfoSchema,
    description: z.string(),
    users: z.number().optional(),
});

export type Cause = z.infer<typeof causeSchema>;

export const skillSchema = z.object({
    _id: z.any().optional(),
    handle: handleSchema,
    name: z.string(),
    picture: fileInfoSchema,
    description: z.string(),
    users: z.number().optional(),
});

export type Skill = z.infer<typeof skillSchema>;

export type WithMetric<T> = T & {
    metrics?: Metrics;
};

export type Metrics = {
    rank?: number;
    similarity?: number;
    distance?: number;
    proximity?: number;
    popularity?: number;
    recentness?: number;
};

export type Weights = {
    similarity: number;
    proximity: number;
    popularity: number;
    recentness: number;
};

// access rules are a map of features to array of user groups that are granted access to the feature
export const accessRulesSchema = z.record(z.string(), z.array(z.string()));

export const pageSchema = z.object({
    name: z.string(),
    handle: handleSchema,
    description: z.string(),
    module: z.string(),
    readOnly: z.boolean().optional(),
    defaultUserGroups: z.array(z.string()).optional(),
});

export type Page = z.infer<typeof pageSchema>;

export type QuestionType = "text" | "yesno";

export const questionSchema = z.object({
    question: z.string(),
    type: z.enum(["text", "yesno"]),
});

export type Question = z.infer<typeof questionSchema>;

export const circleSchema = z.object({
    _id: z.any().optional(),
    did: didSchema.optional(),
    publicKey: z.string().optional(),
    name: z.string().default("Circles").optional(),
    type: accountTypeSchema.default("user").optional(),
    email: z.string().email().optional(),
    handle: handleSchema.optional(),
    picture: fileInfoSchema.optional(),
    cover: fileInfoSchema.optional(),
    description: z.string().optional(),
    mission: z.string().optional(),
    isPublic: z.boolean().optional(),
    userGroups: z.array(userGroupSchema).default([]).optional(),
    pages: z.array(pageSchema).default([]).optional(),
    accessRules: accessRulesSchema.optional(),
    members: z.number().default(0).optional(),
    questionnaire: z.array(questionSchema).default([]).optional(),
    parentCircleId: z.string().optional(),
    createdBy: didSchema.optional(),
    createdAt: z.date().optional(),
    circleType: circleTypeSchema.optional(),
    interests: z.array(z.string()).optional(),
    offers_needs: z.array(z.string()).optional(),
    location: locationSchema.optional(),
    causes: z.array(z.string()).optional(),
    skills: z.array(z.string()).optional(),
    completedOnboardingSteps: z.array(z.string()).optional(),
    matrixAccessToken: z.string().optional(),
    matrixUsername: z.string().optional(),
    matrixPassword: z.string().optional(),
    matrixNotificationsRoomId: z.string().optional(),
    isAdmin: z.boolean().optional(),
});

export type Circle = z.infer<typeof circleSchema>;

export const serverSettingsSchema = z.object({
    _id: z.any().optional(),
    name: z.string().optional(),
    description: z.string().optional(),
    did: didSchema.optional(),
    defaultCircleId: z.string().optional(),
    mapboxKey: z.string().optional(),
    openaiKey: z.string().optional(),
    url: z.string().optional(),
    registryUrl: z.string().optional(),
    activeRegistryInfo: registryInfoSchema.optional(),
    jwtSecret: z.string().optional(),
    serverInfo: registryInfoSchema.optional(),
    questionnaire: z.string().optional(),
    serverVersion: z.string().optional(),
    matrixAdminAccessToken: z.string().optional(),
});

export type ServerSettings = z.infer<typeof serverSettingsSchema>;

export type Content = Circle | MemberDisplay | PostDisplay;

export type SortingOptions = "similarity" | "near" | "pop" | "new" | "top" | "custom";

export type PostItemProps = {
    post: PostDisplay;
    circle: Circle;
    feed: Feed;
    page?: Page;
    subpage?: string;
    inPreview?: boolean;
    initialComments?: CommentDisplay[];
    initialShowAllComments?: boolean;
    isAggregateFeed?: boolean;
};

export type ContentPreviewData =
    | { type: "post"; content: Post; props: PostItemProps }
    | { type: "member"; content: MemberDisplay; props?: never }
    | { type: "user"; content: Circle; props?: never }
    | { type: "circle"; content: Circle; props?: never }
    | { type: "default"; content: Content; props?: Record<string, unknown> };

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
    user: Circle;
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
    | "number"
    | "textarea"
    | "switch"
    | "image"
    | "array"
    | "table"
    | "hidden"
    | "email"
    | "password"
    | "select"
    | "handle"
    | "access-rules"
    | "registry-info"
    | "questionnaire"
    | "tags"
    | "location"
    | "causes"
    | "skills";

export type FormField = {
    name: string;
    label: string | UserAndCircleInfo;
    type: FormFieldType;
    placeholder?: string;
    autoComplete?: string;
    description?: string | UserAndCircleInfo;
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
    defaultValue?: any;
};

export type UserAndCircleInfo = {
    user: string;
    circle: string;
};

export type FormSchema = {
    id: string;
    title: string | UserAndCircleInfo;
    description: string | UserAndCircleInfo;
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
    user?: Circle;
    setUser: (user: UserPrivate) => void;
    searchParams: ReadonlyURLSearchParams;
    toast: ({ ...props }: Toast) => void;
    setAuthenticated: (authenticated: boolean) => void;
};

export type PlatformMetrics = {
    circles: number;
    users: number;
};

export type MissionDisplay = {
    name: string;
    mission: string;
    picture: string;
};

export type UserToolboxTab = "chat" | "notifications" | "profile";
export type UserToolboxData = {
    tab: UserToolboxTab;
};

export const chatRoomMemberSchema = z.object({
    _id: z.any().optional(),
    userDid: didSchema,
    chatRoomId: z.string(),
    circleId: z.string().optional(),
    joinedAt: z.date(),
});

export const challengeSchema = z.object({
    _id: z.any().optional(),
    publicKey: z.string().optional(),
    challenge: z.string(),
    createdAt: z.date(),
    expiresAt: z.date(),
    verified: z.boolean().optional(),
});
export type Challenge = z.infer<typeof challengeSchema>;

export type ChatRoomMember = z.infer<typeof chatRoomMemberSchema>;

export type Account = {
    did: string;
    publicKey: string;
    name: string;
    handle: string;
    picture: string;
    requireAuthentication: boolean;
};

export type AccountAndPrivateKey = Partial<Account> & {
    privateKey: string;
};

export type AuthInfo = {
    authStatus: "loading" | "authenticated" | "unauthenticated" | "createAccount";
    inSsiApp: boolean;
    currentAccount?: Account;
    challenge?: Challenge;
};

export type MatrixUserCache = {
    [username: string]: Circle;
};

export type TabOptions = "following" | "discover";

export type UserSettings = {
    feedTab: TabOptions;
    circlesTab: TabOptions;
};

export type NotificationType =
    | "follow_request"
    | "new_follower"
    | "follow_accepted"
    | "post_comment" // Someone commented on your post
    | "comment_reply" // Someone replied to your comment
    | "post_like" // Someone liked your post
    | "comment_like" // Someone liked your comment
    | "post_mention" // Someone mentioned you in a post
    | "comment_mention"; // Someone mentioned you in a comment
