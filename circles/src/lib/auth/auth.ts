// digital identity, security, authentication and encryption

import crypto from "crypto";
import fs from "fs";
import path from "path";
import { Challenges, Circles, Members } from "../data/db";
import { Account, AccountType, Challenge, Circle, Feature, Member, UserPrivate } from "@/models/models";
import { ObjectId } from "mongodb";
import { maxAccessLevel } from "../data/constants";
import { cookies } from "next/headers";
import { createSession, generateUserToken, verifyUserToken } from "./jwt";
import { createNewUser, getUserById, getUserPrivate } from "../data/user";
import { addMember, getMembers } from "../data/member";
import { getCircleById, getCirclesByDids, getCirclesByIds, getDefaultCircle } from "../data/circle";
import { registerOrLoginMatrixUser } from "../data/matrix";

const SALT_FILENAME = "salt.bin";
const IV_FILENAME = "iv.bin";
const PUBLIC_KEY_FILENAME = "publicKey.pem";
const PRIVATE_KEY_FILENAME = "privateKey.pem";
const ENCRYPTED_PRIVATE_KEY_FILENAME = "privateKey.pem.enc";
const ENCRYPTION_ALGORITHM = "aes-256-cbc";
export const APP_DIR = "/circles";
export const USERS_DIR = path.join(APP_DIR, "users");
const SERVER_DIR = path.join(APP_DIR, "server");

export const createUserTrad = async (
    name: string,
    handle: string,
    type: AccountType,
    email: string,
    password: string,
): Promise<Circle> => {
    if (!name || !email || !password || !handle) {
        throw new Error("Missing required fields");
    }

    // check if email is already in use
    let existingUser = await Circles.findOne({ email: email });
    if (existingUser) {
        throw new Error("Email already in use");
    }

    // check if handle is already in use
    existingUser = await Circles.findOne({ handle: handle });
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
        .update(publicKey.export({ type: "pkcs1", format: "pem" }) as string)
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

    let publicKeyPem = publicKey.export({ type: "pkcs1", format: "pem" });

    // save salt, iv and keypair in the user directory
    fs.writeFileSync(path.join(accountPath, SALT_FILENAME), salt);
    fs.writeFileSync(path.join(accountPath, IV_FILENAME), iv);
    fs.writeFileSync(path.join(accountPath, PUBLIC_KEY_FILENAME), publicKey.export({ type: "pkcs1", format: "pem" }));
    fs.writeFileSync(path.join(accountPath, ENCRYPTED_PRIVATE_KEY_FILENAME), encryptedPrivateKey);

    // add user to the database
    let user: Circle = createNewUser(did, publicKeyPem as string, name, handle, type, email);
    let res = await Circles.insertOne(user);
    user._id = res.insertedId.toString();

    // add user as member of their own circle
    await addMember(did, user._id!, ["admins", "moderators", "members"], undefined);

    // add user to default circle by default
    // let defaultCircle = await getDefaultCircle();
    // if (defaultCircle._id) {
    //     await addMember(user.did!, defaultCircle._id, ["members"]);
    // }

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

export const getMemberAccessLevel = async (userDid: string, circleId: string): Promise<number> => {
    let user = await Circles.findOne({ did: userDid });
    if (!user) return maxAccessLevel;

    let membership = await Members.findOne({ userDid: userDid, circleId: circleId });
    if (!membership) return maxAccessLevel;

    let userGroups = membership.userGroups;
    if (!userGroups || userGroups.length <= 0) return maxAccessLevel;

    let circle = await Circles.findOne({ _id: new ObjectId(circleId) });
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
): Promise<boolean> => {
    const userAccessLevel = await getMemberAccessLevel(userDid, circleId);
    const memberAccessLevel = await getMemberAccessLevel(memberDid, circleId);

    if (acceptSameLevel) {
        return userAccessLevel <= memberAccessLevel;
    } else {
        return userAccessLevel < memberAccessLevel;
    }
};

// gets authenticated user DID or throws an error if user is not authenticated
export const getAuthenticatedUserDid = async (): Promise<string | undefined> => {
    const token = (await cookies()).get("token")?.value;
    if (!token) {
        return undefined;
    }

    let payload = await verifyUserToken(token);
    let userDid = payload.userDid as string;
    if (!userDid) {
        return undefined;
    }

    return userDid;
};

// checks if user is authorized to use a given feature
export const isAuthorized = async (
    userDid: string | undefined,
    circleId: string,
    feature: Feature | string,
): Promise<boolean> => {
    // lookup access rules in circle for the features
    let circle = await Circles.findOne({ _id: new ObjectId(circleId) });
    if (!circle) return false;

    let featureHandle = typeof feature === "string" ? feature : feature.handle;
    let allowedUserGroups = circle?.accessRules?.[featureHandle];
    if (!allowedUserGroups) return false;
    if (allowedUserGroups.includes("everyone")) return true;

    // lookup user membership in circle
    let membership = await Members.findOne({ userDid: userDid, circleId: circleId });
    if (!membership) return false;
    return allowedUserGroups.some((group) => membership?.userGroups?.includes(group));
};

export const getAuthorizedMembers = async (circle: string | Circle, feature: Feature | string): Promise<Circle[]> => {
    if (typeof circle === "string") {
        circle = await getCircleById(circle);
    }
    let featureHandle = typeof feature === "string" ? feature : feature.handle;
    let allowedUserGroups = circle?.accessRules?.[featureHandle];

    if (!allowedUserGroups) return [];

    // get authenticated user IDs
    let members: Member[] = [];
    if (allowedUserGroups.includes("everyone")) {
        members = await getMembers(circle._id!);
    } else {
        members = await getMembers(circle._id!);
        members = members.filter((member) => allowedUserGroups.some((group) => member.userGroups?.includes(group)));
    }

    const memberDids = members.map((member) => member.userDid);
    return await getCirclesByDids(memberDids);
};

// new auth

export const getUniqueHandle = async (displayName: string): Promise<string> => {
    let handle = displayName.toLowerCase().replace(/\s/g, "-");

    // check if handle is already in use
    let existingUser = await Circles.findOne({ handle: handle });
    while (existingUser) {
        // Append a random number to the handle to make it unique
        handle += Math.floor(Math.random() * 10);
        existingUser = await Circles.findOne({ handle: handle });
    }
    return handle;
};

export const createUserAccount = async (displayName: string): Promise<{ user: UserPrivate; privateKey: string }> => {
    // Generate RSA key pair
    const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
        modulusLength: 2048,
        publicKeyEncoding: { type: "spki", format: "pem" },
        privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });

    // Derive DID from public key
    const did = getDid(publicKey);

    // Create a handle for the user
    let handle = await getUniqueHandle(displayName);

    // Create and save user in the database using DID and public key
    const user = createNewUser(did, publicKey, displayName, handle);

    let res = await Circles.insertOne(user);
    user._id = res.insertedId.toString();

    // add user as member of their own circle
    await addMember(did, user._id!, ["admins", "moderators", "members"], undefined);

    // Add user as a member of the default circle
    const defaultCircle = await getDefaultCircle();
    if (defaultCircle._id) {
        await addMember(did, defaultCircle._id, ["members"]);
    }

    const userPrivate = await getUserPrivate(did);

    //console.log("Created user", userPrivate);
    return { user: userPrivate, privateKey }; // Return user and private key for client-side storage
};

export const createUserFromAccount = async (account: Account): Promise<UserPrivate> => {
    // Derive DID from public key
    const did = getDid(account.publicKey);

    // make sure user doesn't exist
    let existingUser = await Circles.findOne({ did: did });
    if (existingUser) {
        throw new Error("User already exists");
    }

    // Create a handle for the user
    let handle = await getUniqueHandle(account.handle ?? account.name);

    // Create and save user in the database using DID and public key
    const user = createNewUser(did, account.publicKey, account.name, handle);

    let res = await Circles.insertOne(user);
    user._id = res.insertedId.toString();

    // add user as member of their own circle
    await addMember(did, user._id!, ["admins", "moderators", "members"], undefined);

    // Add user as a member of the default circle
    const defaultCircle = await getDefaultCircle();
    if (defaultCircle._id) {
        await addMember(did, defaultCircle._id, ["members"]);
    }

    const userPrivate = await getUserPrivate(did);
    return userPrivate;
};

export const createUser = async (did: string, publicKey: string): Promise<UserPrivate> => {
    // console.log("Creating user", did, publicKey);

    // add user to the database
    let user: Circle = createNewUser(did, publicKey);
    let res = await Circles.insertOne(user);
    user._id = res.insertedId.toString();

    // add user as member of their own circle
    await addMember(did, user._id!, ["admins", "moderators", "members"], undefined);
    let userPrivate = await getUserPrivate(did);
    return userPrivate;
};

export const issueChallenge = async (publicKey?: string): Promise<Challenge> => {
    let challengeStr = crypto.randomBytes(32).toString("hex");
    let createdAt = new Date();
    let expiresAt = new Date(createdAt.getTime() + 5 * 60 * 1000); // 5 minutes

    // store the challenge
    // console.log("Issuing challenge", challengeStr, "public key", publicKey);
    let challenge: Challenge = { challenge: challengeStr, createdAt, expiresAt, publicKey };
    let res = await Challenges.insertOne(challenge);
    challenge._id = res.insertedId.toString();
    return challenge;
};

export const getChallenge = async (challengeStr: string): Promise<Challenge> => {
    // get the most recent challenge
    let res = (await Challenges.findOne({ challenge: challengeStr }, { sort: { createdAt: -1 } })) as Challenge;
    return res;
};

export const verifyChallengeSignature = async (
    publicKey: string,
    signature: string,
    challengeStr: string,
): Promise<boolean> => {
    // get the most recent challenge
    let res = (await Challenges.findOne({ challenge: challengeStr }, { sort: { createdAt: -1 } })) as Challenge;
    if (!res) {
        console.log("Challenge not found");
        return false;
    }

    // verify the signature
    const verify = crypto.createVerify("SHA256");
    verify.update(challengeStr);
    const isValidSignature = verify.verify(publicKey, signature, "base64");

    if (!isValidSignature) {
        console.log("Invalid signature");
        return false;
    }

    console.log("Signature valid");

    // challenge is valid, mark it as verified
    await Challenges.updateOne({ _id: res._id }, { $set: { verified: true, publicKey } });

    return true;
};

export const getDid = (publicKey: string): string => {
    // hash the public key using SHA-256
    const hash = crypto.createHash("sha256").update(publicKey).digest();

    // convert hash to Base64 and make it URL-safe
    const base64Url = hash
        .toString("base64")
        .replace(/\+/g, "-") // Replace + with -
        .replace(/\//g, "_") // Replace / with _
        .replace(/=+$/, ""); // Remove trailing =

    // prefix the result to form a DID
    return `did:circles:${base64Url}`;
};

export async function createUserSession(user: UserPrivate): Promise<string> {
    let token = await generateUserToken(user.did!);
    await createSession(token);

    try {
        // check if user has a matrix account
        await registerOrLoginMatrixUser(user);
    } catch (error) {
        console.error("Error creating matrix session", error);
    }

    return token;
}
