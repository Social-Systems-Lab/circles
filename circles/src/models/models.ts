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
export const circleTypeSchema = z.enum(["user", "circle", "project"]);
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
    ignoredCircles?: string[]; // IDs of circles the user has chosen to ignore
    notificationSettings?: GroupedNotificationSettings;
    notificationPauseConfig?: {
        allUntil?: Date; // For "Pause All"
        categoryUntil?: Record<string, Date>; // For "Pause Category", key is category/module handle
    };
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
    module: z.string(),
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
    postType: z.enum(["post", "goal", "task", "issue", "proposal"]).optional(), // To identify shadow posts for projects
    userGroups: z.array(z.string()).default([]), // User groups that can see this post
    parentItemId: z.string().optional(), // ID of the parent Goal, Task, Issue, or Proposal for shadow posts
    parentItemType: z.enum(["goal", "task", "issue", "proposal"]).optional(), // Type of the parent item
    // Link Preview Fields
    linkPreviewUrl: z.string().url().optional(),
    linkPreviewTitle: z.string().optional(),
    linkPreviewDescription: z.string().optional(),
    linkPreviewImage: fileInfoSchema.optional(),
    // Internal Link Preview Fields
    internalPreviewType: z.enum(["circle", "post", "proposal", "issue", "task", "goal"]).optional(),
    internalPreviewId: z.string().optional(), // Handle for circle, ID for others
    internalPreviewUrl: z.string().url().optional(),
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
    // Populated internal preview data
    internalPreviewData?: Circle | PostDisplay | TaskDisplay | ProposalDisplay | IssueDisplay | null;
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
    contentId: z.string(), // ID of the post, comment, or proposal
    contentType: z.enum(["post", "comment", "chatMessage", "proposal"]),
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
    searchRank?: number; // Added for search results
};

export type Weights = {
    similarity: number;
    proximity: number;
    popularity: number;
    recentness: number;
};

// Define the schema for module-specific access rules (feature -> user groups)
export const moduleAccessRulesSchema = z.record(z.string(), z.array(z.string()));

// Define the schema for the entire access rules structure
export const accessRulesSchema = z.record(z.string(), moduleAccessRulesSchema);

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
    name: z.string().optional(),
    type: accountTypeSchema.default("user").optional(),
    email: z.string().email().optional(),
    handle: handleSchema.optional(),
    picture: fileInfoSchema.optional(),
    images: z.array(mediaSchema).optional(),
    description: z.string().optional(),
    content: z.string().optional(),
    mission: z.string().optional(),
    isPublic: z.boolean().optional(),
    userGroups: z.array(userGroupSchema).default([]).optional(),
    enabledModules: z.array(z.string()).default([]).optional(),
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
    ignoredCircles: z.array(z.string()).optional(),
    agreedToTos: z.boolean().optional(),
    agreedToEmailUpdates: z.boolean().optional(),
    metadata: z.record(z.string(), z.any()).optional(), // For storing additional data like commentPostId
    // Password Reset Fields
    passwordResetToken: z.string().nullable().optional(),
    passwordResetTokenExpiry: z.date().nullable().optional(),
    // Email Verification Fields
    isEmailVerified: z.boolean().optional(),
    emailVerificationToken: z.string().nullable().optional(),
    emailVerificationTokenExpiry: z.date().nullable().optional(),
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

// Define Permissions type based on what IssuesModule passes
export type IssuePermissions = {
    canModerate: boolean;
    canReview: boolean;
    canAssign: boolean;
    canResolve: boolean;
    canComment: boolean;
};

// Define Permissions type for Tasks (mirroring IssuePermissions)
export type TaskPermissions = {
    canModerate: boolean;
    canReview: boolean;
    canAssign: boolean;
    canResolve: boolean;
    canComment: boolean;
};

// Define Permissions type for Goals (mirroring IssuePermissions)
export type GoalPermissions = {
    canModerate: boolean;
    canReview: boolean;
    canResolve: boolean;
    canComment: boolean;
    canCreateTask: boolean;
};

export type SortingOptions = "similarity" | "near" | "pop" | "new" | "top" | "custom";

export type PostItemProps = {
    post: PostDisplay;
    circle: Circle;
    feed: Feed;
    inPreview?: boolean;
    initialComments?: CommentDisplay[];
    initialShowAllComments?: boolean;
    isAggregateFeed?: boolean;
    hideContent?: boolean;
    embedded?: boolean;
    disableComments?: boolean;
};

export type ContentPreviewData =
    | { type: "post"; content: Post; props: PostItemProps }
    | { type: "member"; content: MemberDisplay; props?: never }
    | { type: "user"; content: Circle; props?: never }
    | { type: "circle"; content: Circle; props?: never }
    | { type: "proposal"; content: ProposalDisplay; props: { circle: Circle } }
    | { type: "issue"; content: IssueDisplay; props: { circle: Circle; permissions: IssuePermissions } }
    | { type: "task"; content: TaskDisplay; props: { circle: Circle; permissions: TaskPermissions } }
    | { type: "goal"; content: GoalDisplay; props: { circle: Circle; permissions: GoalPermissions } }
    | {
          type: "default";
          content: Content | ProposalDisplay | IssueDisplay | TaskDisplay;
          props?: Record<string, unknown>;
      }; // Added TaskDisplay

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
    | "skills"
    | "auto-handle";

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
    disabled?: boolean;
    component?: string; // For custom field components
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
    newHandle?: string; // Added for redirect after handle change
};

export type FormAction = {
    id: string;
    onSubmit: (values: Record<string, any>) => Promise<FormSubmitResponse>;
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

export type UserToolboxTab = "chat" | "notifications" | "profile" | "circles" | "contacts" | "account" | undefined;
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

export const goalMemberSchema = z.object({
    _id: z.any().optional(),
    userId: z.string(), // Points to User._id
    goalId: z.string(),
    circleId: z.string(),
    joinedAt: z.date().optional(),
});

export type GoalMember = z.infer<typeof goalMemberSchema>;

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
    | "follow_request" // Someone requests to follow a circle - sent to users with permissions to approve requests
    | "new_follower" // A circle has a new follower - for non-user circles notifications are sent to all followers of the circle
    | "follow_accepted" // Someone's request to follow a circle has been accepted - sent to user being accepted
    | "post_comment" // Someone commented on a post - sent to post author
    | "comment_reply" // Someone replied to a comment - sent to comment author and post author
    | "post_like" // Someone liked a post - sent to post author
    | "comment_like" // Someone liked a comment - sent to comment author
    | "post_mention" // Someone mentioned a user in a post - sent to user mentioned
    | "comment_mention" // Someone mentioned as user in a comment - sent to user mentioned
    // Proposal Notifications
    | "proposal_submitted_for_review" // Proposal submitted for review - sent to users with review permissions
    | "proposal_moved_to_voting" // Proposal moved to voting stage - sent to users with voting permissions
    | "proposal_approved_for_voting" // Proposal approved for voting - sent to proposal author
    | "proposal_resolved" // Proposal resolved - sent to proposal author (message adapts to outcome/stage)
    | "proposal_resolved_voter" // Proposal resolved - sent to voters (message adapts to outcome/stage)
    | "proposal_vote" // Someone voted on a proposal - sent to proposal author
    // Issue Notifications
    | "issue_submitted_for_review" // Issue submitted for review - sent to users with review permissions
    | "issue_approved" // Issue approved (moved to Open) - sent to issue author
    | "issue_assigned" // Issue assigned to a user - sent to the assignee
    | "issue_status_changed" // Issue status changed (e.g., Open -> In Progress, In Progress -> Resolved) - sent to author/assignee
    // Task Notifications (mirroring Issue Notifications)
    | "task_submitted_for_review"
    | "task_approved"
    | "task_assigned"
    | "task_status_changed"
    // Goal Notifications
    | "goal_submitted_for_review"
    | "goal_approved"
    | "goal_status_changed"
    | "goal_completed" // A goal has been marked as completed
    | "proposal_to_goal" // A proposal has been converted to a goal
    // Ranking Notifications
    | "ranking_stale_reminder" // User's ranking list is stale, reminder sent
    | "ranking_grace_period_ended" // User's ranking list is past grace period
    // Consolidated Summary Notification Types
    | "COMMUNITY_FOLLOW_REQUEST" // Replaces follow_request
    | "COMMUNITY_NEW_FOLLOWER" // Replaces new_follower
    // follow_accepted is not configurable by user
    | "POSTS_ALL" // Covers all post and comment notifications (post_comment, comment_reply, post_like, comment_like, post_mention, comment_mention)
    | "PROPOSALS_ALL" // Covers all proposal notifications
    | "ISSUES_ALL" // Covers all issue notifications
    | "TASKS_ALL" // Covers all task notifications AND ranking_stale_reminder, ranking_grace_period_ended
    | "GOALS_ALL"; // Covers all goal notifications

// Helper array for NotificationType values
// Note: Granular types are kept for backend sending logic, but UI will use summary types.
// The schema should include ALL possible types that can be stored.
// For the UI settings, we will filter down to the summary types.
export const notificationTypeValues = [
    // Granular (still needed for backend sending logic and potentially direct storage if ever needed)
    "follow_request",
    "new_follower",
    "follow_accepted", // Not configurable by user, but still a type
    "post_comment",
    "comment_reply",
    "post_like",
    "comment_like",
    "post_mention",
    "comment_mention",
    "proposal_submitted_for_review",
    "proposal_moved_to_voting",
    "proposal_approved_for_voting",
    "proposal_resolved",
    "proposal_resolved_voter",
    "proposal_vote",
    "issue_submitted_for_review",
    "issue_approved",
    "issue_assigned",
    "issue_status_changed",
    "task_submitted_for_review",
    "task_approved",
    "task_assigned",
    "task_status_changed",
    "goal_submitted_for_review",
    "goal_approved",
    "goal_status_changed",
    "goal_completed",
    "proposal_to_goal",
    "ranking_stale_reminder",
    "ranking_grace_period_ended",
    // Summary Types (for user configuration)
    "COMMUNITY_FOLLOW_REQUEST",
    "COMMUNITY_NEW_FOLLOWER",
    "POSTS_ALL",
    "PROPOSALS_ALL",
    "ISSUES_ALL",
    "TASKS_ALL",
    "GOALS_ALL",
] as const;

export const notificationTypeSchema = z.enum(notificationTypeValues);

// Define which notification types are summary types for UI configuration
export const summaryNotificationTypes = [
    "COMMUNITY_FOLLOW_REQUEST",
    "COMMUNITY_NEW_FOLLOWER",
    "POSTS_ALL",
    "PROPOSALS_ALL",
    "ISSUES_ALL",
    "TASKS_ALL",
    "GOALS_ALL",
] as const;
export type SummaryNotificationType = (typeof summaryNotificationTypes)[number];

export const summaryNotificationTypeDetails: Record<
    SummaryNotificationType,
    { label: string; moduleHandle?: string; mapsTo?: NotificationType[] }
> = {
    COMMUNITY_FOLLOW_REQUEST: { label: "Follow Request", moduleHandle: "members", mapsTo: ["follow_request"] }, // Technically 'members' or 'general'
    COMMUNITY_NEW_FOLLOWER: { label: "New Follower", moduleHandle: "members", mapsTo: ["new_follower"] }, // Technically 'members' or 'general'
    POSTS_ALL: {
        label: "Posts",
        moduleHandle: "feed",
        mapsTo: ["post_comment", "comment_reply", "post_like", "comment_like", "post_mention", "comment_mention"],
    },
    PROPOSALS_ALL: {
        label: "Proposals",
        moduleHandle: "proposals",
        mapsTo: [
            "proposal_submitted_for_review",
            "proposal_moved_to_voting",
            "proposal_approved_for_voting",
            "proposal_resolved",
            "proposal_resolved_voter",
            "proposal_vote",
        ],
    },
    ISSUES_ALL: {
        label: "Issues",
        moduleHandle: "issues",
        mapsTo: ["issue_submitted_for_review", "issue_approved", "issue_assigned", "issue_status_changed"],
    },
    TASKS_ALL: {
        label: "Tasks", // Changed label
        moduleHandle: "tasks", // Tasks module might also handle ranking notifications
        mapsTo: [
            "task_submitted_for_review",
            "task_approved",
            "task_assigned",
            "task_status_changed",
            "ranking_stale_reminder",
            "ranking_grace_period_ended",
        ],
    },
    GOALS_ALL: {
        label: "Goals",
        moduleHandle: "goals",
        mapsTo: [
            "goal_submitted_for_review",
            "goal_approved",
            "goal_status_changed",
            "goal_completed",
            "proposal_to_goal",
        ],
    },
};

export const entityTypeSchema = z.enum([
    "CIRCLE",
    "POST",
    "COMMENT",
    "PROPOSAL",
    "ISSUE",
    "TASK",
    "GOAL",
    "USER", // For user-level notifications not tied to a specific sub-entity instance
]);
export type EntityType = z.infer<typeof entityTypeSchema>;

export const userNotificationSettingSchema = z.object({
    _id: z.any().optional(),
    userId: didSchema, // User's identifier
    entityId: z.string(), // ID of the specific entity instance (e.g., circleId, postId). Could be userId if entityType is USER.
    entityType: entityTypeSchema,
    notificationType: notificationTypeSchema,
    isEnabled: z.boolean(),
    pausedUntil: z.date().optional(), // For pausing individual notification types
    createdAt: z.date().optional(),
    updatedAt: z.date().optional(),
});
export type UserNotificationSetting = z.infer<typeof userNotificationSettingSchema>;

export const defaultNotificationSettingSchema = z.object({
    _id: z.any().optional(),
    entityType: entityTypeSchema,
    notificationType: notificationTypeSchema,
    defaultIsEnabled: z.boolean(),
    requiredPermission: z.string().optional(), // Key for a permission check, e.g., "CAN_APPROVE_MEMBERSHIP_REQUESTS"
});
export type DefaultNotificationSetting = z.infer<typeof defaultNotificationSettingSchema>;

// Type for the structured notification settings used by the frontend and getPrivateUser
export type GroupedNotificationSettings = Record<
    EntityType,
    Record<string, Record<NotificationType, { isEnabled: boolean; isConfigurable: boolean }>>
>;

// Define all onboarding steps in a single place for consistency
export const ONBOARDING_STEPS = [
    "welcome",
    "terms",
    "mission",
    "profile",
    "location",
    "causes",
    "skills",
    "final",
] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export type ModuleInfo = {
    handle: string;
    name: string;
    description: string;
    readOnly?: boolean;
};

// Proposal stages
export const proposalStageSchema = z.enum(["draft", "review", "voting", "accepted", "implemented", "rejected"]);

export type ProposalStage = z.infer<typeof proposalStageSchema>;

// Proposal outcome (when resolved)
export const proposalOutcomeSchema = z.enum(["accepted", "rejected"]);

export type ProposalOutcome = z.infer<typeof proposalOutcomeSchema>;

// Proposal model
export const proposalSchema = z.object({
    _id: z.any().optional(),
    circleId: z.string(),
    createdBy: didSchema,
    createdAt: z.date(),
    editedAt: z.date().optional(),
    name: z.string(),
    background: z.string(), // Context, rationale, history
    decisionText: z.string(), // The specific action/request being decided
    images: z.array(mediaSchema).optional(), // Images for the background section
    stage: proposalStageSchema.default("draft"),
    outcome: proposalOutcomeSchema.optional(),
    outcomeReason: z.string().optional(),
    resolvedAtStage: proposalStageSchema.optional(), // Stage when the proposal was resolved
    votingDeadline: z.date().optional(),
    reactions: z.record(z.string(), z.number()).default({}), // For "likes" in voting stage
    userGroups: z.array(z.string()).default([]), // User groups that can see this proposal
    location: locationSchema.optional(), // Added location field
    commentPostId: z.string().optional(), // Optional link to a shadow post for comments
    goalId: z.string().optional(), // Optional link to a goal created from this proposal
});

export type Proposal = z.infer<typeof proposalSchema>;

// Display type with author information
export interface ProposalDisplay extends Proposal {
    author: Circle;
    userReaction?: string; // Current user's reaction
    circle?: Circle;
    location?: Location; // Added location field
    rank?: number; // Aggregated rank
    userRank?: number; // User's specific rank
    totalRankers?: number; // Total users who have ranked proposals in this context
    hasUserRanked?: boolean; // Whether the current user has a valid ranking for proposals
    unrankedCount?: number; // Number of 'accepted' proposals the user hasn't ranked yet
    linkedGoal?: GoalDisplay; // Optional linked goal details
}

// Issue stages
export const issueStageSchema = z.enum(["review", "open", "inProgress", "resolved"]);
export type IssueStage = z.infer<typeof issueStageSchema>;

// Issue model
export const issueSchema = z.object({
    _id: z.any().optional(),
    circleId: z.string(),
    createdBy: didSchema,
    createdAt: z.date(),
    updatedAt: z.date().optional(), // Track updates
    resolvedAt: z.date().optional(), // Track resolution time
    title: z.string(),
    description: z.string(),
    stage: issueStageSchema.default("review"),
    assignedTo: didSchema.optional(), // User DID of the assignee
    userGroups: z.array(z.string()).default([]), // User groups that can see this issue
    location: locationSchema.optional(),
    commentPostId: z.string().optional(), // Optional link to a shadow post for comments
    images: z.array(mediaSchema).optional(), // Optional images/media attached to the issue
});

export type Issue = z.infer<typeof issueSchema>;

// Display type with author and assignee information
export interface IssueDisplay extends Issue {
    author: Circle; // Creator's details
    assignee?: Circle; // Assignee's details (optional)
    circle?: Circle; // Circle details
}

// Ranked List for prioritization
export const rankedListSchema = z.object({
    _id: z.any().optional(),
    entityId: z.string(), // ID of the circle or other entity
    type: z.enum(["tasks", "goals", "issues", "proposals", "poll"]), // Added "issues", "proposals"
    userId: z.string(), // User's _id who submitted this ranking
    list: z.array(z.string()), // Ordered array of item IDs
    createdAt: z.date(),
    updatedAt: z.date(),
    isValid: z.boolean().default(true), // Flag to mark if the list is current and usable for aggregation
    becameStaleAt: z.date().optional(), // When the list first became incomplete relative to active items
    lastStaleReminderSentAt: z.date().nullable().optional(), // Track when the stale reminder was last sent
    lastGracePeriodEndedSentAt: z.date().nullable().optional(), // Track when the grace period ended notification was last sent
});

export type RankedList = z.infer<typeof rankedListSchema>;

// Task stages (mirroring Issue stages for now)
export const taskStageSchema = z.enum(["review", "open", "inProgress", "resolved"]);
export type TaskStage = z.infer<typeof taskStageSchema>;

// Task model (mirroring Issue model)
export const taskSchema = z.object({
    _id: z.any().optional(),
    circleId: z.string(),
    createdBy: didSchema,
    createdAt: z.date(),
    updatedAt: z.date().optional(), // Track updates
    resolvedAt: z.date().optional(), // Track resolution time
    title: z.string(),
    description: z.string(),
    stage: taskStageSchema.default("review"),
    assignedTo: didSchema.optional(), // User DID of the assignee
    userGroups: z.array(z.string()).default([]), // User groups that can see this task
    location: locationSchema.optional(),
    commentPostId: z.string().optional(), // Optional link to a shadow post for comments
    images: z.array(mediaSchema).optional(), // Optional images/media attached to the task
    goalId: z.string().optional(), // Optional link to a goal
});

export type Task = z.infer<typeof taskSchema>;

// Display type with author and assignee information (mirroring IssueDisplay)
export interface TaskDisplay extends Task {
    author: Circle; // Creator's details
    assignee?: Circle; // Assignee's details (optional)
    circle?: Circle; // Circle details
    rank?: number; // Aggregated task rank
    goal?: GoalDisplay; // Associated goal details
}

// Goal stages
export const goalStageSchema = z.enum(["review", "open", "completed"]); // Replaced "resolved" with "completed"
export type GoalStage = z.infer<typeof goalStageSchema>;

// Goal model
export const goalSchema = z.object({
    _id: z.any().optional(),
    circleId: z.string(),
    createdBy: didSchema,
    createdAt: z.date(),
    updatedAt: z.date().optional(), // Track updates
    resolvedAt: z.date().optional(), // Track resolution time - consider renaming to completedAt or removing if stage 'completed' implies this
    completedAt: z.date().optional(), // Explicitly for completion
    title: z.string(),
    description: z.string(),
    stage: goalStageSchema.default("review"), // Use goalStageSchema
    targetDate: z.date().nullable().optional(), // Added targetDate
    userGroups: z.array(z.string()).default([]), // User groups that can see this goal
    location: locationSchema.optional(),
    commentPostId: z.string().optional(), // Optional link to a shadow post for comments
    images: z.array(mediaSchema).optional(), // Optional images/media attached to the goal
    proposalId: z.string().optional(), // Optional link to the proposal this goal was created from
    followers: z.array(didSchema).optional(), // Array of user DIDs following the goal
    // Fields for completed goal result
    resultSummary: z.string().optional(),
    resultImages: z.array(mediaSchema).optional(),
    resultPostId: z.string().optional(), // ID of the "victory" post associated with the completed goal
});

export type Goal = z.infer<typeof goalSchema>;

// Display type with author and assignee information (mirroring IssueDisplay)
export interface GoalDisplay extends Goal {
    author: Circle; // Creator's details
    circle?: Circle; // Circle details
    // Removed rank?: number;
    // Ensure new fields are available if needed for display
    // completedAt?: Date;
    // resultSummary?: string;
    // resultImages?: Media[];
    // resultPostId?: string;
}
