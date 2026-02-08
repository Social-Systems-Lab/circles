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
    RankedList,
    Goal,
    GoalMember, // Added GoalMember model
    UserNotificationSetting, // Added UserNotificationSetting model
    DefaultNotificationSetting, // Added DefaultNotificationSetting model
    Event,
    EventRsvp,
    EventInvitation,
    Notification,
} from "@/models/models";
import { AggregateRank } from "./ranking";
import { ChatConversation, ChatMessageDoc } from "@/lib/chat/mongo-types";

const MONGO_HOST = process.env.MONGO_HOST || "127.0.0.1";
const MONGO_PORT = parseInt(process.env.MONGO_PORT || "27017");
const MONGO_ADMIN_USER = process.env.MONGO_ROOT_USERNAME || "admin";
const MONGO_ADMIN_PASSWORD = process.env.MONGO_ROOT_PASSWORD || "password";
const MONGO_CONNECTION_STRING = `mongodb://${MONGO_ADMIN_USER}:${MONGO_ADMIN_PASSWORD}@${MONGO_HOST}:${MONGO_PORT}`;

const options: MongoClientOptions = {};

// Initialize client and collections conditionally
let client: MongoClient;
let db: Db;
let Circles: Collection<Circle>;
let ServerSettingsCollection: Collection<ServerSettings>;
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
let Goals: Collection<Goal>;
let Events: Collection<Event>;
let EventRsvps: Collection<EventRsvp>;
let EventInvitations: Collection<EventInvitation>;
let GoalMembers: Collection<GoalMember>; // Added GoalMembers collection
let RankedLists: Collection<RankedList>;
let AggregateRanks: Collection<AggregateRank>;
let UserNotificationSettings: Collection<UserNotificationSetting>; // Added UserNotificationSettings collection
let DefaultNotificationSettings: Collection<DefaultNotificationSetting>; // Added DefaultNotificationSettings collection
let Notifications: Collection<Notification>;
let ChatConversations: Collection<ChatConversation>;
let ChatMessageDocs: Collection<ChatMessageDoc>;

// Only initialize the database connection if not in build mode
if (process.env.IS_BUILD !== "true") {
    client = new MongoClient(MONGO_CONNECTION_STRING, options);

    // Connect the client - this establishes the connection more reliably
    client.connect().catch((err) => {
        console.error("MongoDB connection error:", err);
    });

    db = client.db("circles");

    Circles = db.collection<Circle>("circles");
    ServerSettingsCollection = db.collection<ServerSettings>("serverSettings");
    Members = db.collection<Member>("members");
    MembershipRequests = db.collection<MembershipRequest>("membershipRequests");
    Feeds = db.collection<Feed>("feeds");
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
    Goals = db.collection<Goal>("goals");
    Events = db.collection<Event>("events");
    EventRsvps = db.collection<EventRsvp>("eventRsvps");
    EventInvitations = db.collection<EventInvitation>("eventInvitations");
    GoalMembers = db.collection<GoalMember>("goalMembers"); // Initialize GoalMembers
    RankedLists = db.collection<RankedList>("rankedLists");
    AggregateRanks = db.collection<AggregateRank>("aggregateRanks");
    UserNotificationSettings = db.collection<UserNotificationSetting>("userNotificationSettings");
    DefaultNotificationSettings = db.collection<DefaultNotificationSetting>("defaultNotificationSettings");
    Notifications = db.collection<Notification>("notifications");
    ChatConversations = db.collection<ChatConversation>("chatConversations");
    ChatMessageDocs = db.collection<ChatMessageDoc>("chatMessageDocs");
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
    Goals,
    Events,
    EventRsvps,
    EventInvitations,
    GoalMembers, // Export GoalMembers
    RankedLists,
    AggregateRanks,
    UserNotificationSettings,
    DefaultNotificationSettings,
    Notifications,
    ChatConversations,
    ChatMessageDocs,
};
