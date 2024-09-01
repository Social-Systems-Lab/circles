// digital identity, security, authentication and encryption

import crypto from "crypto";
import fs from "fs";
import path from "path";
import { Circles, Members, Users } from "../data/db";
import { AccountType, Feature, User } from "@/models/models";
import { ObjectId } from "mongodb";
import { maxAccessLevel } from "../data/constants";
import { cookies } from "next/headers";
import { verifyUserToken } from "./jwt";
import { createNewUser, getUserById } from "../data/user";
import { addMember } from "../data/member";
import { getCircleById } from "../data/circle";

const SALT_FILENAME = "salt.bin";
const IV_FILENAME = "iv.bin";
const PUBLIC_KEY_FILENAME = "publicKey.pem";
const PRIVATE_KEY_FILENAME = "privateKey.pem";
const ENCRYPTED_PRIVATE_KEY_FILENAME = "privateKey.pem.enc";
const ENCRYPTION_ALGORITHM = "aes-256-cbc";
export const APP_DIR = "/circles";
export const USERS_DIR = path.join(APP_DIR, "users");
const SERVER_DIR = path.join(APP_DIR, "server");

export const createUser = async (
    name: string,
    handle: string,
    type: AccountType,
    email: string,
    password: string,
): Promise<User> => {
    if (!name || !email || !password || !handle) {
        throw new Error("Missing required fields");
    }

    // check if email is already in use
    let existingUser = await Users.findOne({ email: email });
    if (existingUser) {
        throw new Error("Email already in use");
    }

    // check if handle is already in use
    existingUser = await Users.findOne({ handle: handle });
    if (existingUser) {
        throw new Error("Handle already in use");
    }

    // make sure account directory exists
    if (!fs.existsSync(USERS_DIR)) {
        fs.mkdirSync(USERS_DIR, { recursive: true });
    }

    // generate cryptographic keypair
    const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });

    // did is public key in shorter string format suitable for URLS and directory naming
    const did = crypto
        .createHash("sha256")
        .update(publicKey.export({ type: "pkcs1", format: "pem" }))
        .digest("hex");

    // create a directory for the user using the did as the name
    const accountPath = path.join(USERS_DIR, did);
    if (fs.existsSync(accountPath)) {
        throw new Error("Account already exists");
    }
    fs.mkdirSync(accountPath, { recursive: true });

    // generate salt, iv, encryption key and encrypt private key
    const salt = crypto.randomBytes(16);
    const iv = crypto.randomBytes(16);
    const encryptionKey = crypto.pbkdf2Sync(password, salt, 100000, 32, "sha512");
    const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, encryptionKey, iv);
    let encryptedPrivateKey = cipher.update(
        privateKey.export({ type: "pkcs1", format: "pem" }) as string,
        "utf8",
        "hex",
    );
    encryptedPrivateKey += cipher.final("hex");

    // save salt, iv and keypair in the user directory
    fs.writeFileSync(path.join(accountPath, SALT_FILENAME), salt);
    fs.writeFileSync(path.join(accountPath, IV_FILENAME), iv);
    fs.writeFileSync(path.join(accountPath, PUBLIC_KEY_FILENAME), publicKey.export({ type: "pkcs1", format: "pem" }));
    fs.writeFileSync(path.join(accountPath, ENCRYPTED_PRIVATE_KEY_FILENAME), encryptedPrivateKey);

    // add user to the database
    let user: User = createNewUser(did, name, handle, type, email);
    let res = await Users.insertOne(user);
    user._id = res.insertedId.toString();

    // add user as member of their own circle
    await addMember(did, user._id!, ["admins", "moderators", "members"], undefined, true);

    return user;
};

export type ServerDid = { did: string; publicKey: string };
export const createServerDid = async (): Promise<ServerDid> => {
    // make sure account directory exists
    if (!fs.existsSync(SERVER_DIR)) {
        fs.mkdirSync(SERVER_DIR, { recursive: true });
    }

    const publicKeyPath = path.join(SERVER_DIR, PUBLIC_KEY_FILENAME);
    const privateKeyPath = path.join(SERVER_DIR, PRIVATE_KEY_FILENAME);

    if (fs.existsSync(publicKeyPath)) {
        // return existing public key
        let publicKey = fs.readFileSync(publicKeyPath, "utf8");
        return { did: crypto.createHash("sha256").update(publicKey).digest("hex"), publicKey };
    }

    if (fs.existsSync(privateKeyPath)) {
        throw new Error("Server private key exists but public key is missing");
    }

    // generate cryptographic keypair
    const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });

    // did is public key in shorter string format suitable for URLS and directory naming
    const did = crypto
        .createHash("sha256")
        .update(publicKey.export({ type: "pkcs1", format: "pem" }))
        .digest("hex");

    // save keypair in the server directory
    fs.writeFileSync(publicKeyPath, publicKey.export({ type: "pkcs1", format: "pem" }));
    fs.writeFileSync(privateKeyPath, privateKey.export({ type: "pkcs1", format: "pem" }));
    let publicKeyString = fs.readFileSync(publicKeyPath, "utf8");
    return { did, publicKey: publicKeyString };
};

export const getServerPublicKey = (): string => {
    const publicKeyPath = path.join(SERVER_DIR, PUBLIC_KEY_FILENAME);
    if (!fs.existsSync(publicKeyPath)) {
        throw new Error("Server public key not found");
    }
    return fs.readFileSync(publicKeyPath, "utf8");
};

export const signRegisterServerChallenge = (challenge: string): string => {
    const privateKeyPath = path.join(SERVER_DIR, PRIVATE_KEY_FILENAME);
    const privateKey = fs.readFileSync(privateKeyPath, "utf8");
    const sign = crypto.createSign("SHA256");
    sign.update(challenge);
    return sign.sign(privateKey, "base64");
};

export const getUserPublicKey = (did: string): string => {
    const publicKeyPath = path.join(USERS_DIR, did, PUBLIC_KEY_FILENAME);
    if (!fs.existsSync(publicKeyPath)) {
        throw new Error("User public key not found");
    }
    return fs.readFileSync(publicKeyPath, "utf8");
};

export const signRegisterUserChallenge = (did: string, password: string, challenge: string): string => {
    const privateKey = getUserPrivateKey(did, password);
    const sign = crypto.createSign("SHA256");
    sign.update(challenge);
    return sign.sign(privateKey, "base64");
};

export class AuthenticationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "AuthenticationError";
    }
}

export const getUserPrivateKey = (did: string, password: string): string => {
    const accountPath = path.join(USERS_DIR, did);
    if (!fs.existsSync(accountPath)) {
        throw new AuthenticationError("Account does not exist");
    }

    const salt = fs.readFileSync(path.join(accountPath, SALT_FILENAME));
    const iv = fs.readFileSync(path.join(accountPath, IV_FILENAME));
    const privateKey = fs.readFileSync(path.join(accountPath, ENCRYPTED_PRIVATE_KEY_FILENAME), "utf8");
    const encryptionKey = crypto.pbkdf2Sync(password, salt, 100000, 32, "sha512");

    // decrypt private key to authenticate user
    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, encryptionKey, iv);

    let decryptedPrivateKey;
    try {
        decryptedPrivateKey = decipher.update(privateKey, "hex", "utf8");
        decryptedPrivateKey += decipher.final("utf8");
    } catch (error) {
        throw new AuthenticationError("Incorrect password");
    }

    return decryptedPrivateKey;
};

export const authenticateUser = (did: string, password: string): boolean => {
    // get private key to authenticate user, throws error if password is incorrect
    getUserPrivateKey(did, password);
    return true;
};

export const getMemberAccessLevel = async (userDid: string, circleId: string, isUser: boolean): Promise<number> => {
    let user = await Users.findOne({ did: userDid });
    if (!user) return maxAccessLevel;

    let membership = await Members.findOne({ userDid: userDid, circleId: circleId });
    if (!membership) return maxAccessLevel;

    let userGroups = membership.userGroups;
    if (!userGroups || userGroups.length <= 0) return maxAccessLevel;

    let circle = null;
    if (isUser) {
        circle = await Users.findOne({ _id: new ObjectId(circleId) });
    } else {
        circle = await Circles.findOne({ _id: new ObjectId(circleId) });
    }
    if (!circle) return maxAccessLevel;

    return Math.min(
        ...userGroups?.map((x) => circle?.userGroups?.find((grp) => grp.handle === x)?.accessLevel ?? maxAccessLevel),
    );
};

// returns true if user has higher access than the member (lower access level number = higher access)
export const hasHigherAccess = async (
    userDid: string,
    memberDid: string,
    circleId: string,
    acceptSameLevel: boolean,
    isUser: boolean,
): Promise<boolean> => {
    const userAccessLevel = await getMemberAccessLevel(userDid, circleId, isUser);
    const memberAccessLevel = await getMemberAccessLevel(memberDid, circleId, isUser);

    if (acceptSameLevel) {
        return userAccessLevel <= memberAccessLevel;
    } else {
        return userAccessLevel < memberAccessLevel;
    }
};

// gets authenticated user DID or throws an error if user is not authenticated
export const getAuthenticatedUserDid = async (): Promise<string> => {
    const token = cookies().get("token")?.value;
    if (!token) {
        throw new AuthenticationError("Authentication failed");
    }

    let payload = await verifyUserToken(token);
    let userDid = payload.userDid as string;
    if (!userDid) {
        throw new AuthenticationError("Authentication failed");
    }

    return userDid;
};

// checks if user is authorized to use a given feature
export const isAuthorized = async (
    userDid: string,
    circleId: string,
    feature: Feature,
    isUser?: boolean,
): Promise<boolean> => {
    // lookup access rules in circle for the features
    let circle = null;
    if (isUser) {
        circle = await Users.findOne({ _id: new ObjectId(circleId) });
    } else {
        circle = await Circles.findOne({ _id: new ObjectId(circleId) });
    }
    if (!circle) return false;

    let allowedUserGroups = circle?.accessRules?.[feature.handle];
    if (!allowedUserGroups) return false;
    if (allowedUserGroups.includes("everyone")) return true;

    // lookup user membership in circle
    let membership = await Members.findOne({ userDid: userDid, circleId: circleId });
    if (!membership) return false;
    return allowedUserGroups.some((group) => membership?.userGroups?.includes(group));
};
