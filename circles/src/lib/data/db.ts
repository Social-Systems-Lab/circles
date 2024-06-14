import { MongoClient, MongoClientOptions } from "mongodb";
import { ServerConfig, User, Circle, Member } from "@/models/models";

const MONGO_HOST = "127.0.0.1"; // TODO get from environment variable
const MONGO_PORT = 27017; // TODO get from environment variable
const MONGO_ADMIN_USER = "admin"; // TODO get from environment variable
const MONGO_ADMIN_PASSWORD = "password"; // TODO get from environment variable
const MONGO_CONNECTION_STRING = `mongodb://${MONGO_ADMIN_USER}:${MONGO_ADMIN_PASSWORD}@${MONGO_HOST}:${MONGO_PORT}`;

const options: MongoClientOptions = {};

export const client = new MongoClient(MONGO_CONNECTION_STRING, options);
export const db = client.db("circles");

export const Users = db.collection<User>("users");
export const Circles = db.collection<Circle>("circles");
export const ServerConfigs = db.collection<ServerConfig>("serverConfigs");
export const Members = db.collection<Member>("members");
