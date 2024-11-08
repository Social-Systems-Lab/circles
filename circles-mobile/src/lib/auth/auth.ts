// auth.ts - self-sovereign digital identity creation and authentication
import crypto from "crypto";
import { Identity } from "../data/models";

// const SALT_FILENAME = "salt.bin";
// const IV_FILENAME = "iv.bin";
// const PUBLIC_KEY_FILENAME = "publicKey.pem";
// const PRIVATE_KEY_FILENAME = "privateKey.pem";
// const ENCRYPTED_PRIVATE_KEY_FILENAME = "privateKey.pem.enc";
const ENCRYPTION_ALGORITHM = "aes-256-cbc";

export const createIdentity = async (name: string, password: string): Promise<Identity> => {
    if (!name || !password) {
        throw new Error("Missing required fields");
    }

    // generate RSA keypair
    const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });

    // did is public key in shorter string format suitable for URLS and directory naming
    const did = crypto
        .createHash("sha256")
        .update(publicKey.export({ type: "pkcs1", format: "pem" }))
        .digest("hex");

    // generate salt, iv, encryption key and encrypt private key
    const salt = crypto.randomBytes(16);
    const iv = crypto.randomBytes(16);
    const encryptionKey = crypto.pbkdf2Sync(password, salt, 100000, 32, "sha512");
    const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, encryptionKey, iv);
    let encryptedPrivateKey = cipher.update(privateKey.export({ type: "pkcs1", format: "pem" }) as string, "utf8", "hex");
    encryptedPrivateKey += cipher.final("hex");

    // save salt, iv and keypair in the user directory

    // add identity to the database
    let identity: Identity = {
        did,
        name,
        publicKey: publicKey.export({ type: "pkcs1", format: "pem" }) as string,
        encryptedPrivateKey: encryptedPrivateKey,
        salt: salt.toString("hex"),
        iv: iv.toString("hex"),
        //public_key_jwk: publicKey.export({ type: "jwk", format: "pem" }),
    };

    return identity;
};

export const authenticateIdentity = (identity: Identity, password: string): boolean => {
    // decrypt private key
    const encryptionKey = crypto.pbkdf2Sync(password, identity.salt, 100000, 32, "sha512");

    // decrypt private key to authenticate user
    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, encryptionKey, identity.iv);

    let decryptedPrivateKey;
    try {
        decryptedPrivateKey = decipher.update(identity.encryptedPrivateKey, "hex", "utf8");
        decryptedPrivateKey += decipher.final("utf8");
    } catch (error) {
        throw new Error("Incorrect password");
    }

    return true;
};
