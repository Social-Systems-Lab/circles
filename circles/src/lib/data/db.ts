import { MongoClient, MongoClientOptions, Db, Collection } from "mongodb";
import { ServerSettings, User, Circle, Member } from "@/models/models";

const MONGO_HOST = process.env.MONGO_HOST || "127.0.0.1";
const MONGO_PORT = parseInt(process.env.MONGO_PORT || "27017");
const MONGO_ADMIN_USER = process.env.MONGO_ROOT_USERNAME || "admin";
const MONGO_ADMIN_PASSWORD = process.env.MONGO_ROOT_PASSWORD || "password";
const MONGO_CONNECTION_STRING = `mongodb://${MONGO_ADMIN_USER}:${MONGO_ADMIN_PASSWORD}@${MONGO_HOST}:${MONGO_PORT}`;

const options: MongoClientOptions = {};

// Initialize client and collections conditionally
let client: MongoClient;
let db: Db;
let Users: Collection<User>;
let Circles: Collection<Circle>;
let ServerSettingsCollection: Collection<ServerSettings>;
let Members: Collection<Member>;

// Only initialize the database connection if not in build mode
if (process.env.IS_BUILD !== "true") {
    client = new MongoClient(MONGO_CONNECTION_STRING, options);
    db = client.db("circles");

    Users = db.collection<User>("users");
    Circles = db.collection<Circle>("circles");
    ServerSettingsCollection = db.collection<ServerSettings>("serverSettings");
    Members = db.collection<Member>("members");
}

export { client, db, Users, Circles, ServerSettingsCollection, Members };

// export const client = new MongoClient(MONGO_CONNECTION_STRING, options);
// export const db = client.db("circles");

// export const Users = db.collection<User>("users");
// export const Circles = db.collection<Circle>("circles");
// export const ServerSettingsCollection = db.collection<ServerSettings>("serverSettings");
// export const Members = db.collection<Member>("members");
