import { MongoClient, MongoClientOptions } from "mongodb";
import { ServerConfig, User, Circle, Member } from "@/models/models";

const MONGO_HOST = process.env.MONGO_HOST || "127.0.0.1";
const MONGO_PORT = parseInt(process.env.MONGO_PORT || "27017");
const MONGO_ADMIN_USER = process.env.MONGO_ROOT_USERNAME || "admin";
const MONGO_ADMIN_PASSWORD = process.env.MONGO_ROOT_PASSWORD || "password";
const MONGO_CONNECTION_STRING = `mongodb://${MONGO_ADMIN_USER}:${MONGO_ADMIN_PASSWORD}@${MONGO_HOST}:${MONGO_PORT}`;

const options: MongoClientOptions = {};

export const client = new MongoClient(MONGO_CONNECTION_STRING, options);
export const db = client.db("circles");

export const Users = db.collection<User>("users");
export const Circles = db.collection<Circle>("circles");
export const ServerConfigs = db.collection<ServerConfig>("serverConfigs");
export const Members = db.collection<Member>("members");
