import { MongoClient, MongoClientOptions } from "mongodb";
import { ServerChallenge, Server, UserChallenge, User } from "./models";

const MONGO_HOST = process.env.MONGO_HOST || "db";
const MONGO_PORT = parseInt(process.env.MONGO_PORT || "27017");
const MONGO_ADMIN_USER = process.env.REGISTRY_MONGO_ROOT_USERNAME || "admin";
const MONGO_ADMIN_PASSWORD = process.env.REGISTRY_MONGO_ROOT_PASSWORD || "password";
const MONGO_CONNECTION_STRING = `mongodb://${MONGO_ADMIN_USER}:${MONGO_ADMIN_PASSWORD}@${MONGO_HOST}:${MONGO_PORT}`;

const options: MongoClientOptions = {};

export const client = new MongoClient(MONGO_CONNECTION_STRING, options);
export const db = client.db("circlesRegistry");

export const Servers = db.collection<Server>("servers");
export const ServerChallenges = db.collection<ServerChallenge>("serverChallenges");

export const Users = db.collection<User>("users");
export const UserChallenges = db.collection<UserChallenge>("userChallenges");
