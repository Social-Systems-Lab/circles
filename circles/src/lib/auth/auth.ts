// digital identity, security, authentication and encryption

import crypto from "crypto";
import fs from "fs";
import path from "path";
import { Challenges, Circles, Members } from "../data/db";
import { Account, AccountType, Challenge, Circle, Feature, Member, UserPrivate } from "@/models/models";
import { ObjectId } from "mongodb";
import { features, maxAccessLevel } from "../data/constants";
import { cookies } from "next/headers";
import { createSession, generateUserToken, verifyUserToken } from "./jwt";
import { createNewUser, getUserById, getUserPrivate } from "../data/user";
import { addMember, getMembers } from "../data/member";
import { getCircleById, getCirclesByDids, getCirclesByIds, getDefaultCircle } from "../data/circle";
import { registerOrLoginMatrixUser } from "../data/matrix";
import { generateSecureToken, hashToken, sendEmail } from "../data/email"; // Added sendEmail for now, will be sendVerificationEmail

export const SALT_FILENAME = "salt.bin";
export const IV_FILENAME = "iv.bin";
export const PUBLIC_KEY_FILENAME = "publicKey.pem";
export const PRIVATE_KEY_FILENAME = "privateKey.pem";
export const ENCRYPTED_PRIVATE_KEY_FILENAME = "privateKey.pem.enc";
export const ENCRYPTION_ALGORITHM = "aes-256-cbc";
export const APP_DIR = "/circles";
export const USERS_DIR = path.join(APP_DIR, "users");
export const SERVER_DIR = path.join(APP_DIR, "server"); // Also export SERVER_DIR if needed elsewhere, otherwise keep as const

export const createUserAccount = async (
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
    const unhashedVerificationToken = generateSecureToken();
    const hashedVerificationToken = hashToken(unhashedVerificationToken);
    const verificationTokenExpiry = new Date(Date.now() + 24 * 3600 * 1000); // 24 hours expiry

    let user: Circle = createNewUser(
        did,
        publicKeyPem as string,
        name,
        handle,
        type,
        email,
        false, // isEmailVerified
        hashedVerificationToken, // emailVerificationToken
        verificationTokenExpiry, // emailVerificationTokenExpiry
    );
    let res = await Circles.insertOne(user);
    user._id = res.insertedId.toString();

    // Send verification email
    const verificationLink = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/verify-email?token=${unhashedVerificationToken}`;
    try {
        await sendEmail({
            to: email,
            templateAlias: "email-verification", // As per spec
            templateModel: {
                name: name,
                actionUrl: verificationLink,
            },
        });
        console.log(`Verification email sent to ${email}`);
    } catch (error) {
        console.error(`Failed to send verification email to ${email}:`, error);
        // Decide if account creation should fail if email sending fails.
        // For now, we'll log the error and continue. User can request resend later.
    }

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

    const salt: Buffer = fs.readFileSync(path.join(accountPath, SALT_FILENAME));
    const iv: Buffer = fs.readFileSync(path.join(accountPath, IV_FILENAME));
    const encryptedPrivateKeyStr: string = fs.readFileSync(
        path.join(accountPath, ENCRYPTED_PRIVATE_KEY_FILENAME),
        "utf8",
    );
    // Explicitly type encryptionKey as Buffer
    const encryptionKey: Buffer = crypto.pbkdf2Sync(password, salt, 100000, 32, "sha512");

    // decrypt private key to authenticate user
    // Pass Buffers directly
    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, encryptionKey, iv);

    let decryptedPrivateKey;
    try {
        decryptedPrivateKey = decipher.update(encryptedPrivateKeyStr, "hex", "utf8"); // Use the string variable
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
    featureInput: Feature,
): Promise<boolean> => {
    let circle = await Circles.findOne({ _id: new ObjectId(circleId) });
    if (!circle) return false;

    let feature: Feature;
    let featureHandle: string;
    let moduleHandle: string;

    // featureInput is a Feature object
    feature = featureInput;
    featureHandle = feature.handle;
    moduleHandle = feature.module; // Use module handle from the object

    // Lookup access rules using moduleHandle and featureHandle from the potentially nested structure
    let allowedUserGroups: string[] | undefined = circle?.accessRules?.[moduleHandle]?.[featureHandle];

    // If feature not found in access rules (is undefined), get default user groups from the feature object
    if (allowedUserGroups === undefined) {
        allowedUserGroups = feature.defaultUserGroups ?? [];
    }

    // Now allowedUserGroups is guaranteed to be string[]
    if (allowedUserGroups.includes("everyone")) return true;

    // If user is not logged in and "everyone" is not allowed, deny access
    if (!userDid) return false;

    // lookup user membership in circle
    let membership = await Members.findOne({ userDid: userDid, circleId: circleId });
    if (!membership) return false;

    // Ensure membership.userGroups is also an array before calling includes
    const memberGroups = membership.userGroups ?? [];
    return allowedUserGroups.some((group) => memberGroups.includes(group));
};

export const getAuthorizedMembers = async (circle: string | Circle, feature: Feature): Promise<Circle[]> => {
    if (typeof circle === "string") {
        circle = await getCircleById(circle);
    }
    let featureHandle = feature.handle;
    let moduleHandle = feature.module;
    let allowedUserGroups = circle?.accessRules?.[moduleHandle]?.[featureHandle];

    // If feature not found in access rules (is undefined), get default user groups from the feature object
    if (allowedUserGroups === undefined) {
        allowedUserGroups = feature.defaultUserGroups ?? [];
    }

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

export async function createUserSession(user: UserPrivate, userDid: string): Promise<string> {
    let token = await generateUserToken(userDid);
    await createSession(token);

    try {
        // check if user has a matrix account
        await registerOrLoginMatrixUser(user, userDid);
    } catch (error) {
        console.error("Error creating matrix session", error);
    }

    return token;
}
