// digital identity, security, authentication and encryption

import crypto from "crypto";
import fs from "fs";
import path from "path";
import { Users } from "./db";
import { AccountType, User } from "@/models/models";

const SALT_FILENAME = "salt.bin";
const IV_FILENAME = "iv.bin";
const PUBLIC_KEY_FILENAME = "publicKey.pem";
const PRIVATE_KEY_FILENAME = "privateKey.pem.enc";
const ENCRYPTION_ALGORITHM = "aes-256-cbc";
const APP_DIR = "/circles";
const USERS_DIR = path.join(APP_DIR, "users");

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
    fs.writeFileSync(path.join(accountPath, PRIVATE_KEY_FILENAME), encryptedPrivateKey);

    // add user to the database
    let user: User = { did: did, name: name, handle: handle, type: type, email: email };
    await Users.insertOne(user);
    return user;
};

export class AuthenticationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "AuthenticationError";
    }
}

export const authenticateUser = (did: string, password: string): boolean => {
    const accountPath = path.join(USERS_DIR, did);
    if (!fs.existsSync(accountPath)) {
        throw new AuthenticationError("Account does not exist");
    }

    const salt = fs.readFileSync(path.join(accountPath, SALT_FILENAME));
    const iv = fs.readFileSync(path.join(accountPath, IV_FILENAME));
    const privateKey = fs.readFileSync(path.join(accountPath, PRIVATE_KEY_FILENAME), "utf8");
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

    return true;
};
