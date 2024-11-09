import { Identity } from "../data/models";

// auth.ts - self-sovereign digital identity creation and authentication
export const createIdentity = async (name: string, password: string): Promise<Identity> => {
    if (!name || !password) {
        throw new Error("Missing required fields");
    }

    // Generate RSA key pair
    const keyPair = await window.crypto.subtle.generateKey(
        {
            name: "RSA-OAEP",
            modulusLength: 2048,
            publicExponent: new Uint8Array([1, 0, 1]),
            hash: "SHA-256",
        },
        true,
        ["encrypt", "decrypt"]
    );

    // Export public key
    const publicKeyExported = await window.crypto.subtle.exportKey("spki", keyPair.publicKey);
    const publicKeyPem = convertArrayBufferToPem(publicKeyExported, "PUBLIC KEY");

    // Generate DID
    const did = await digestMessage(publicKeyPem);

    // Generate salt and IV
    const salt = window.crypto.getRandomValues(new Uint8Array(16));
    const iv = window.crypto.getRandomValues(new Uint8Array(16));

    // Derive encryption key using PBKDF2
    const passwordKey = await window.crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);

    const encryptionKey = await window.crypto.subtle.deriveKey(
        {
            name: "PBKDF2",
            salt: salt,
            iterations: 100000,
            hash: "SHA-512",
        },
        passwordKey,
        { name: "AES-CBC", length: 256 },
        false,
        ["encrypt", "decrypt"]
    );

    // Export private key and encrypt it
    const privateKeyExported = await window.crypto.subtle.exportKey("pkcs8", keyPair.privateKey);
    const encryptedPrivateKeyBuffer = await window.crypto.subtle.encrypt({ name: "AES-CBC", iv: iv }, encryptionKey, privateKeyExported);
    const encryptedPrivateKey = bufferToHex(encryptedPrivateKeyBuffer);

    // Create identity object
    const identity: Identity = {
        did,
        name,
        publicKey: publicKeyPem,
        encryptedPrivateKey,
        salt: bufferToHex(salt),
        iv: bufferToHex(iv),
    };

    return identity;
};

export const authenticateIdentity = async (identity: Identity, password: string): Promise<boolean> => {
    const salt = hexToBuffer(identity.salt);
    const iv = hexToBuffer(identity.iv);
    const encryptedPrivateKeyBuffer = hexToBuffer(identity.encryptedPrivateKey);

    // Derive encryption key using PBKDF2
    const passwordKey = await window.crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);

    const encryptionKey = await window.crypto.subtle.deriveKey(
        {
            name: "PBKDF2",
            salt: salt,
            iterations: 100000,
            hash: "SHA-512",
        },
        passwordKey,
        { name: "AES-CBC", length: 256 },
        false,
        ["encrypt", "decrypt"]
    );

    // Decrypt private key
    try {
        const decryptedPrivateKeyBuffer = await window.crypto.subtle.decrypt({ name: "AES-CBC", iv: iv }, encryptionKey, encryptedPrivateKeyBuffer);

        // Import the decrypted private key to verify it's correct
        await window.crypto.subtle.importKey(
            "pkcs8",
            decryptedPrivateKeyBuffer,
            {
                name: "RSA-OAEP",
                hash: "SHA-256",
            },
            true,
            ["decrypt"]
        );

        return true;
    } catch (error) {
        return false;
    }
};

// Helper functions
function convertArrayBufferToPem(buffer: ArrayBuffer, label: string): string {
    const base64String = btoa(String.fromCharCode(...new Uint8Array(buffer)));
    const pemString = `-----BEGIN ${label}-----\n${base64String}\n-----END ${label}-----`;
    return pemString;
}

async function digestMessage(message: string): Promise<string> {
    const msgUint8 = new TextEncoder().encode(message);
    const hashBuffer = await window.crypto.subtle.digest("SHA-256", msgUint8);
    return bufferToHex(hashBuffer);
}

function bufferToHex(buffer: ArrayBuffer): string {
    return Array.from(new Uint8Array(buffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}

function hexToBuffer(hexString: string): ArrayBuffer {
    const bytes = new Uint8Array(hexString.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16)));
    return bytes.buffer;
}
