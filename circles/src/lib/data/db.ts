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
    Cause,
    Skill,
    ChatRoom,
    ChatMessage,
    ChatRoomMember,
} from "@/models/models";

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
let Causes: Collection<Cause>;
let Skills: Collection<Skill>;
let ChatRooms: Collection<ChatRoom>;
let ChatMessages: Collection<ChatMessage>;
let ChatRoomMembers: Collection<ChatRoomMember>;

// Only initialize the database connection if not in build mode
if (process.env.IS_BUILD !== "true") {
    client = new MongoClient(MONGO_CONNECTION_STRING, options);
    db = client.db("circles");

    Circles = db.collection<Circle>("circles");
    ServerSettingsCollection = db.collection<ServerSettings>("serverSettings");
    Members = db.collection<Member>("members");
    MembershipRequests = db.collection<MembershipRequest>("membershipRequests");
    Feeds = db.collection<Feed>("feeds");
    Posts = db.collection<Post>("posts");
    Comments = db.collection<Comment>("comments");
    Reactions = db.collection<Reaction>("reactions");
    Causes = db.collection<Cause>("causes");
    Skills = db.collection<Skill>("skills");
    ChatRooms = db.collection<ChatRoom>("chatRooms");
    ChatMessages = db.collection<ChatMessage>("chatMessages");
    ChatRoomMembers = db.collection<ChatRoomMember>("chatRoomMembers");
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
    Causes,
    ChatRooms,
    ChatMessages,
    ChatRoomMembers,
};
