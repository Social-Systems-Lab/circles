import { MongoClient, MongoClientOptions, Db, Collection } from "mongodb";
import {
    ServerSettings,
    Circle,
    Member,
    MembershipRequest,
    Feed,
    Post,
    Reaction,
    Comment,
    Cause as SDG,
    Skill,
    ChatRoom,
    ChatMessage,
    ChatRoomMember,
    Challenge,
    Proposal,
    Issue,
    Task,
    FundingAsk,
    RankedList,
    Goal,
    GoalMember, // Added GoalMember model
    UserNotificationSetting, // Added UserNotificationSetting model
    DefaultNotificationSetting, // Added DefaultNotificationSetting model
    Event,
    EventRsvp,
    EventInvitation,
    EventOccurrence,
    EventOccurrenceRsvp,
    EventOccurrenceInvitation,
    SecretCircleInvitation,
    Notification,
    ExternalNotificationChannel,
    HumanityVerification,
    PlatformSettings,
    PlatformAuditEvent,
    PrivateMedia,
} from "@/models/models";
import { AggregateRank } from "./ranking";
import {
    ChatConversation,
    ChatMessageDoc,
    ChatReadState,
    ChatTopicReadState,
    MessageEmailReminder,
    ChatTopicDraft,
    ChatTopicDraftTombstone,
    CanonicalDmClaim,
} from "@/lib/chat/mongo-types";

export type CapturedEmailDoc = {
    to: string;
    templateAlias: string;
    templateModel: Record<string, unknown>;
    createdAt: Date;
    expiresAt: Date;
};
import type { PlatformBroadcastMessage } from "./platform-broadcasts";
import type { MembershipCredentialHandoff } from "@/lib/vibe-id/membership-credential-handoffs";
import type { MembershipCredentialStatus } from "@/lib/vibe-id/membership-credential-statuses";
import { COMMUNITY_FEED_UNIQUE_INDEX_KEYS, COMMUNITY_FEED_UNIQUE_INDEX_OPTIONS } from "./feed-indexes";
import { EVENT_OCCURRENCE_UNIQUE_INDEX_KEYS, EVENT_OCCURRENCE_UNIQUE_INDEX_OPTIONS } from "./event-occurrence-indexes";
import {
    EVENT_OCCURRENCE_RSVP_UNIQUE_INDEX_KEYS,
    EVENT_OCCURRENCE_RSVP_UNIQUE_INDEX_OPTIONS,
} from "./event-occurrence-rsvp-indexes";
import {
    EVENT_OCCURRENCE_INVITATION_UNIQUE_INDEX_KEYS,
    EVENT_OCCURRENCE_INVITATION_UNIQUE_INDEX_OPTIONS,
} from "./event-occurrence-invitation-indexes";

const MONGODB_URI =
    process.env.MONGODB_URI ||
    `mongodb://${process.env.MONGO_ROOT_USERNAME || "admin"}:${process.env.MONGO_ROOT_PASSWORD || "password"}@${process.env.MONGO_HOST || "127.0.0.1"}:${process.env.MONGO_PORT || "27017"}`;

const options: MongoClientOptions = {};
const MONGODB_DATABASE = process.env.CIRCLES_MONGODB_DATABASE || "circles";
if (process.env.NODE_ENV === "test" && !/^circles_stage1a_test_[a-z0-9_-]+$/i.test(MONGODB_DATABASE)) {
    throw new Error("Tests must use a disposable CIRCLES_MONGODB_DATABASE named circles_stage1a_test_*");
}

console.log(
    "DEBUG DB: process.env.MONGODB_URI =",
    (process.env.MONGODB_URI || "").replace(/\/\/([^:]+):([^@]+)@/, "//$1:***@"),
);
console.log("DEBUG DB: fallback parts =", {
    MONGO_ROOT_USERNAME: process.env.MONGO_ROOT_USERNAME,
    MONGO_HOST: process.env.MONGO_HOST,
    MONGO_PORT: process.env.MONGO_PORT,
});

// Initialize client and collections conditionally
let client: MongoClient;
let db: Db;
let Circles: Collection<Circle>;
let ServerSettingsCollection: Collection<ServerSettings>;
let PlatformSettingsCollection: Collection<PlatformSettings>;
let Members: Collection<Member>;
let MembershipRequests: Collection<MembershipRequest>;
let Feeds: Collection<Feed>;
let Posts: Collection<Post>;
let Comments: Collection<Comment>;
let Reactions: Collection<Reaction>;
let Sdgs: Collection<SDG>;
let Skills: Collection<Skill>;
let ChatRooms: Collection<ChatRoom>;
let ChatMessages: Collection<ChatMessage>;
let ChatRoomMembers: Collection<ChatRoomMember>;
let Challenges: Collection<Challenge>;
let Proposals: Collection<Proposal>;
let Issues: Collection<Issue>;
let Tasks: Collection<Task>;
let FundingAsks: Collection<FundingAsk>;
let Goals: Collection<Goal>;
let Events: Collection<Event>;
let EventRsvps: Collection<EventRsvp>;
let EventInvitations: Collection<EventInvitation>;
let EventOccurrences: Collection<EventOccurrence>;
let EventOccurrenceRsvps: Collection<EventOccurrenceRsvp>;
let EventOccurrenceInvitations: Collection<EventOccurrenceInvitation>;
let SecretCircleInvitations: Collection<SecretCircleInvitation>;
let GoalMembers: Collection<GoalMember>; // Added GoalMembers collection
let RankedLists: Collection<RankedList>;
let AggregateRanks: Collection<AggregateRank>;
let UserNotificationSettings: Collection<UserNotificationSetting>; // Added UserNotificationSettings collection
let DefaultNotificationSettings: Collection<DefaultNotificationSetting>; // Added DefaultNotificationSettings collection
let Notifications: Collection<Notification>;
let ChatConversations: Collection<ChatConversation>;
let ChatMessageDocs: Collection<ChatMessageDoc>;
let ChatReadStates: Collection<ChatReadState>;
let ChatTopicReadStates: Collection<ChatTopicReadState>;
let MessageEmailReminders: Collection<MessageEmailReminder>;
let ChatTopicDrafts: Collection<ChatTopicDraft>;
let ChatTopicDraftTombstones: Collection<ChatTopicDraftTombstone>;
let CanonicalDmClaims: Collection<CanonicalDmClaim>;
let ExternalNotificationChannels: Collection<ExternalNotificationChannel>;
let PlatformBroadcastMessages: Collection<PlatformBroadcastMessage>;
let StripeWebhookEvents: Collection<any>;
let UserRelationships: Collection<any>;
let HumanityVerifications: Collection<HumanityVerification>;
let PlatformAuditEvents: Collection<PlatformAuditEvent>;
let PrivateMediaCollection: Collection<PrivateMedia>;
let MembershipCredentialHandoffs: Collection<MembershipCredentialHandoff>;
let MembershipCredentialStatuses: Collection<MembershipCredentialStatus>;
let CapturedEmails: Collection<CapturedEmailDoc>;

// Only initialize the database connection if not in build mode
if (process.env.IS_BUILD !== "true") {
    client = new MongoClient(MONGODB_URI, options);
    // Connect the client - this establishes the connection more reliably
    client.connect().catch((err) => {
        console.error("MongoDB connection error:", err);
    });

    db = client.db(MONGODB_DATABASE);

    Circles = db.collection<Circle>("circles");
    ServerSettingsCollection = db.collection<ServerSettings>("serverSettings");
    Members = db.collection<Member>("members");
    MembershipRequests = db.collection<MembershipRequest>("membershipRequests");
    Feeds = db.collection<Feed>("feeds");
    Feeds.createIndex(COMMUNITY_FEED_UNIQUE_INDEX_KEYS, COMMUNITY_FEED_UNIQUE_INDEX_OPTIONS).catch((error) => {
        console.error("Failed to create community feed unique index:", error);
    });
    Posts = db.collection<Post>("posts");
    Comments = db.collection<Comment>("comments");
    Reactions = db.collection<Reaction>("reactions");
    Sdgs = db.collection<SDG>("sdgs");
    Skills = db.collection<Skill>("skills");
    ChatRooms = db.collection<ChatRoom>("chatRooms");
    ChatMessages = db.collection<ChatMessage>("chatMessages");
    ChatRoomMembers = db.collection<ChatRoomMember>("chatRoomMembers");
    Challenges = db.collection<Challenge>("challenges");
    Proposals = db.collection<Proposal>("proposals");
    Issues = db.collection<Issue>("issues");
    Tasks = db.collection<Task>("tasks");
    FundingAsks = db.collection<FundingAsk>("fundingAsks");
    Goals = db.collection<Goal>("goals");
    Events = db.collection<Event>("events");
    EventRsvps = db.collection<EventRsvp>("eventRsvps");
    EventInvitations = db.collection<EventInvitation>("eventInvitations");
    EventOccurrences = db.collection<EventOccurrence>("eventOccurrences");
    EventOccurrences.createIndex(EVENT_OCCURRENCE_UNIQUE_INDEX_KEYS, EVENT_OCCURRENCE_UNIQUE_INDEX_OPTIONS).catch(
        (error) => {
            console.error("Failed to create event occurrence unique index:", error);
        },
    );
    EventOccurrenceRsvps = db.collection<EventOccurrenceRsvp>("eventOccurrenceRsvps");
    EventOccurrenceRsvps.createIndex(
        EVENT_OCCURRENCE_RSVP_UNIQUE_INDEX_KEYS,
        EVENT_OCCURRENCE_RSVP_UNIQUE_INDEX_OPTIONS,
    ).catch((error) => {
        console.error("Failed to create event occurrence RSVP unique index:", error);
    });
    EventOccurrenceInvitations = db.collection<EventOccurrenceInvitation>("eventOccurrenceInvitations");
    EventOccurrenceInvitations.createIndex(
        EVENT_OCCURRENCE_INVITATION_UNIQUE_INDEX_KEYS,
        EVENT_OCCURRENCE_INVITATION_UNIQUE_INDEX_OPTIONS,
    ).catch((error) => {
        console.error("Failed to create event occurrence invitation unique index:", error);
    });
    SecretCircleInvitations = db.collection<SecretCircleInvitation>("secretCircleInvitations");
    GoalMembers = db.collection<GoalMember>("goalMembers"); // Initialize GoalMembers
    RankedLists = db.collection<RankedList>("rankedLists");
    AggregateRanks = db.collection<AggregateRank>("aggregateRanks");
    UserNotificationSettings = db.collection<UserNotificationSetting>("userNotificationSettings");
    DefaultNotificationSettings = db.collection<DefaultNotificationSetting>("defaultNotificationSettings");
    Notifications = db.collection<Notification>("notifications");
    ChatConversations = db.collection<ChatConversation>("chatConversations");
    ChatMessageDocs = db.collection<ChatMessageDoc>("chatMessageDocs");
    ChatReadStates = db.collection<ChatReadState>("chatReadStates");
    ChatTopicReadStates = db.collection<ChatTopicReadState>("chatTopicReadStates");
    MessageEmailReminders = db.collection<MessageEmailReminder>("messageEmailReminders");
    ChatTopicDrafts = db.collection<ChatTopicDraft>("chatTopicDrafts");
    ChatTopicDraftTombstones = db.collection<ChatTopicDraftTombstone>("chatTopicDraftTombstones");
    CanonicalDmClaims = db.collection<CanonicalDmClaim>("canonicalDmClaims");
    ExternalNotificationChannels = db.collection<ExternalNotificationChannel>("externalNotificationChannels");
    PlatformBroadcastMessages = db.collection<PlatformBroadcastMessage>("platformBroadcastMessages");
    StripeWebhookEvents = db.collection("stripeWebhookEvents");
    UserRelationships = db.collection("userRelationships");
    HumanityVerifications = db.collection<HumanityVerification>("humanityVerifications");
    PlatformSettingsCollection = db.collection<PlatformSettings>("platformSettings");
    PlatformAuditEvents = db.collection<PlatformAuditEvent>("platformAuditEvents");
    PrivateMediaCollection = db.collection<PrivateMedia>("privateMedia");
    MembershipCredentialHandoffs = db.collection<MembershipCredentialHandoff>("membershipCredentialHandoffs");
    CapturedEmails = db.collection<CapturedEmailDoc>("capturedEmails");
    MembershipCredentialHandoffs.createIndex({ tokenHash: 1 }, { unique: true }).catch((error) => {
        console.error("Failed to create membership credential handoff token index:", error);
    });
    MembershipCredentialHandoffs.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }).catch((error) => {
        console.error("Failed to create membership credential handoff expiry index:", error);
    });
    MembershipCredentialStatuses = db.collection<MembershipCredentialStatus>("membershipCredentialStatuses");
    MembershipCredentialStatuses.createIndex({ tokenHash: 1 }, { unique: true }).catch((error) => {
        console.error("Failed to create membership credential status token index:", error);
    });
    MembershipCredentialStatuses.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }).catch((error) => {
        console.error("Failed to create membership credential status expiry index:", error);
    });
}
export async function getDb() {
    if (!client) throw new Error("Mongo client not initialised (IS_BUILD=true?)");
    // If not connected yet (or got reloaded), ensure connection is established
    await client.connect();
    return client.db(MONGODB_DATABASE);
}

let requiredChatIndexesReady: Promise<void> | undefined;

export function ensureRequiredChatIndexes(): Promise<void> {
    if (!client || !ChatTopicReadStates) {
        return Promise.reject(new Error("Mongo client not initialised (IS_BUILD=true?)"));
    }
    requiredChatIndexesReady ??= (async () => {
        await client.connect();
        const conflicts = await Promise.all([
            ChatTopicDrafts.aggregate([
                { $group: { _id: { authorDid: "$authorDid", recipientDid: "$recipientDid" }, count: { $sum: 1 } } },
                { $match: { count: { $gt: 1 } } },
                { $limit: 1 },
            ]).hasNext(),
            CanonicalDmClaims.aggregate([
                { $group: { _id: "$pairKey", count: { $sum: 1 } } },
                { $match: { count: { $gt: 1 } } },
                { $limit: 1 },
            ]).hasNext(),
            ChatMessageDocs.aggregate([
                { $match: { submissionId: { $type: "string" } } },
                { $group: { _id: { senderDid: "$senderDid", submissionId: "$submissionId" }, count: { $sum: 1 } } },
                { $match: { count: { $gt: 1 } } },
                { $limit: 1 },
            ]).hasNext(),
            ChatTopicDraftTombstones.aggregate([
                {
                    $group: {
                        _id: { authorDid: "$authorDid", recipientDid: "$recipientDid", generation: "$generation" },
                        count: { $sum: 1 },
                    },
                },
                { $match: { count: { $gt: 1 } } },
                { $limit: 1 },
            ]).hasNext(),
        ]);
        if (conflicts.some(Boolean)) {
            throw new Error("Required chat unique indexes cannot be initialized because conflicting records exist");
        }
        await Promise.all([
            ChatConversations.createIndex({ participants: 1, type: 1, archived: 1, updatedAt: -1 }),
            ChatConversations.createIndex({ circleId: 1, type: 1, archived: 1 }),
            ChatRoomMembers.createIndex({ userDid: 1, chatRoomId: 1 }),
            ChatRoomMembers.createIndex({ chatRoomId: 1 }),
            ChatMessageDocs.createIndex({ conversationId: 1, _id: 1 }),
            ChatMessageDocs.createIndex({ conversationId: 1, threadId: 1, _id: 1 }),
            ChatReadStates.createIndex({ userDid: 1, conversationId: 1 }),
            ChatTopicReadStates.createIndex({ userDid: 1, conversationId: 1, topicId: 1 }, { unique: true }),
            ChatTopicDrafts.createIndex({ authorDid: 1, recipientDid: 1 }, { unique: true }),
            ChatTopicDrafts.createIndex({ authorDid: 1, state: 1, updatedAt: -1 }),
            ChatTopicDraftTombstones.createIndex({ authorDid: 1, recipientDid: 1, generation: 1 }, { unique: true }),
            CanonicalDmClaims.createIndex({ pairKey: 1 }, { unique: true }),
            ChatMessageDocs.createIndex(
                { senderDid: 1, submissionId: 1 },
                { unique: true, partialFilterExpression: { submissionId: { $type: "string" } } },
            ),
            ChatMessageDocs.createIndex({ "firstTopicNotification.state": 1, "firstTopicNotification.leaseUntil": 1 }),
        ]);
    })().catch((error) => {
        requiredChatIndexesReady = undefined;
        throw error;
    });
    return requiredChatIndexesReady;
}

let secretCircleInvitationIndexesReady: Promise<void> | undefined;

export function ensureSecretCircleInvitationIndexes(): Promise<void> {
    if (!client || !SecretCircleInvitations) {
        return Promise.reject(new Error("Mongo client not initialised (IS_BUILD=true?)"));
    }
    secretCircleInvitationIndexesReady ??= (async () => {
        await client.connect();
        await SecretCircleInvitations.createIndex(
            { circleId: 1, recipientDid: 1 },
            { unique: true, partialFilterExpression: { status: "pending" } },
        );
    })();
    return secretCircleInvitationIndexesReady;
}

export {
    client,
    db,
    Circles,
    ServerSettingsCollection,
    Members,
    MembershipRequests,
    Feeds,
    Posts,
    Comments,
    Reactions,
    Skills,
    Sdgs,
    ChatRooms,
    ChatMessages,
    ChatRoomMembers,
    Challenges,
    Proposals,
    Issues,
    Tasks,
    FundingAsks,
    Goals,
    Events,
    EventRsvps,
    EventInvitations,
    EventOccurrences,
    EventOccurrenceRsvps,
    EventOccurrenceInvitations,
    SecretCircleInvitations,
    GoalMembers, // Export GoalMembers
    RankedLists,
    AggregateRanks,
    UserNotificationSettings,
    DefaultNotificationSettings,
    Notifications,
    ChatConversations,
    ChatMessageDocs,
    ChatReadStates,
    ChatTopicReadStates,
    MessageEmailReminders,
    ChatTopicDrafts,
    ChatTopicDraftTombstones,
    CanonicalDmClaims,
    ExternalNotificationChannels,
    PlatformBroadcastMessages,
    StripeWebhookEvents,
    UserRelationships,
    HumanityVerifications,
    PlatformSettingsCollection,
    PlatformAuditEvents,
    PrivateMediaCollection,
    MembershipCredentialHandoffs,
    MembershipCredentialStatuses,
    CapturedEmails,
};
