// AuthContext.tsx

import React, { createContext, useContext, useState, useEffect } from "react";
import { Buffer } from "buffer";
import * as FileSystem from "expo-file-system";
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import RSAKey from "react-native-rsa-expo";

// Polyfill Buffer for React Native if necessary
if (typeof Buffer === "undefined") {
    global.Buffer = require("buffer").Buffer;
}

type Account = {
    did: string;
    publicKey: string;
    name: string;
    requireAuthentication: boolean;
};

type AuthContextType = {
    currentAccount: Account | null;
    accounts: Account[];
    createAccount: (name: string) => Promise<void>;
    login: (accountId: string) => Promise<void>;
    switchAccount: (accountId: string) => Promise<void>;
    logout: () => Promise<void>;
    updateAccount: (updatedAccount: Account) => Promise<void>;
    signRequest: (challenge: string) => Promise<string | undefined>;
    loading: boolean;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [currentAccount, setCurrentAccount] = useState<Account | null>(null);
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [loading, setLoading] = useState<boolean>(false);

    // Storage Keys
    const ACCOUNTS_KEY = "accounts";
    const CURRENT_ACCOUNT_DID_KEY = "currentAccountDid";

    // Store account metadata in AsyncStorage
    const storeAccountMetadata = async (accounts: Account[]): Promise<void> => {
        await AsyncStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
    };

    const loadAccountMetadata = async (): Promise<Account[]> => {
        const data = await AsyncStorage.getItem(ACCOUNTS_KEY);
        return data ? JSON.parse(data) : [];
    };

    // Store current account DID in AsyncStorage
    const storeCurrentAccountDid = async (accountDid: string | null): Promise<void> => {
        if (accountDid) {
            await AsyncStorage.setItem(CURRENT_ACCOUNT_DID_KEY, accountDid);
        } else {
            await AsyncStorage.removeItem(CURRENT_ACCOUNT_DID_KEY);
        }
    };

    const loadCurrentAccountDid = async (): Promise<string | null> => {
        return await AsyncStorage.getItem(CURRENT_ACCOUNT_DID_KEY);
    };

    // Generate a random encryption key
    const generateEncryptionKey = async (): Promise<Uint8Array> => {
        const key = await Crypto.getRandomBytesAsync(32); // 256-bit key
        return key;
    };

    // Store the encryption key securely
    const storeEncryptionKey = async (account: Account, keyBytes: Uint8Array): Promise<void> => {
        const secureStoreKey = account.did.replace(/[^a-zA-Z0-9._-]/g, "");
        await SecureStore.setItemAsync(secureStoreKey, Buffer.from(keyBytes).toString("base64"), {
            requireAuthentication: account.requireAuthentication,
        });
    };

    // Retrieve the encryption key from secure storage
    const retrieveEncryptionKey = async (account: Account): Promise<Uint8Array | null> => {
        const secureStoreKey = account.did.replace(/[^a-zA-Z0-9._-]/g, "");
        const keyBase64 = await SecureStore.getItemAsync(secureStoreKey, {
            requireAuthentication: account.requireAuthentication,
            authenticationPrompt: "Authenticate to access your account",
        });
        return keyBase64 ? Uint8Array.from(Buffer.from(keyBase64, "base64")) : null;
    };

    // Encrypt data using AES (Placeholder)
    const encryptData = (data: string, keyBytes: Uint8Array): string => {
        // Implement encryption here if desired
        return data;
    };

    // Decrypt data using AES (Placeholder)
    const decryptData = (encryptedData: string, keyBytes: Uint8Array): string => {
        // Implement decryption here if desired
        return encryptedData;
    };

    // Generate RSA key pair using react-native-rsa-expo
    const generateRSAKeyPair = async (): Promise<{ privateKey: string; publicKey: string }> => {
        const bits = 2048;
        const exponent = "10001"; // must be a string
        const rsa = new RSAKey();
        rsa.generate(bits, exponent);
        const publicKey = rsa.getPublicString(); // returns JSON encoded string
        const privateKey = rsa.getPrivateString(); // returns JSON encoded string
        return { privateKey, publicKey };
    };

    // Derive DID from RSA public key using URL-safe Base64 encoding
    const deriveDIDFromPublicKey = async (publicKeyJson: string): Promise<string> => {
        // Parse the public key JSON string
        const publicKeyObject = JSON.parse(publicKeyJson);

        // Create a canonical JSON string
        const canonicalPublicKeyJson = JSON.stringify(publicKeyObject, Object.keys(publicKeyObject).sort());

        // Hash the canonical JSON string using SHA-256
        const hash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, canonicalPublicKeyJson);

        // Convert hash to Uint8Array
        const hashBytes = Uint8Array.from(Buffer.from(hash, "hex"));

        // Encode hash using URL-safe Base64 without padding
        const didSuffix = Buffer.from(hashBytes).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

        // Construct the DID
        const did = `did:circles:${didSuffix}`;
        return did;
    };

    // Initialize on component mount
    useEffect(() => {
        console.log("Initializing AuthProvider");

        const initialize = async (): Promise<void> => {
            setLoading(true);

            console.log("Clearing accounts...");
            await AsyncStorage.setItem(ACCOUNTS_KEY, "");

            const loadedAccounts = await loadAccountMetadata();
            setAccounts(loadedAccounts);

            console.log("Loaded accounts:", loadedAccounts);

            if (loadedAccounts.length > 0) {
                // Load current account ID
                const currentAccountId = await loadCurrentAccountDid();
                if (currentAccountId) {
                    const account = loadedAccounts.find((acc) => acc.did === currentAccountId);
                    if (account) {
                        setCurrentAccount(account);
                    }
                } else {
                    // If no current account ID, set the first account as current
                    setCurrentAccount(loadedAccounts[0]);
                    await storeCurrentAccountDid(loadedAccounts[0].did);
                }
            }
            setLoading(false);
        };
        initialize();
    }, []);

    // Create a new account
    const createAccount = async (name: string): Promise<void> => {
        setLoading(true);

        console.log("Creating new account:", name);
        console.log("Generating RSA key pair...");

        // Trim leading and trailing whitespace
        name = name.trim();

        // Generate RSA key pair
        const keys = await generateRSAKeyPair();
        const publicKey = keys.publicKey;
        const privateKey = keys.privateKey;
        console.log("Public Key:", publicKey);
        console.log("Private Key:", privateKey);

        // Derive DID
        console.log("Deriving DID...");
        const did = await deriveDIDFromPublicKey(publicKey);
        console.log("DID:", did);

        // Create new account object
        const newAccount: Account = { did, publicKey, name, requireAuthentication: false };

        // Generate and store encryption key
        console.log("Generating encryption key...");
        const encryptionKey = await generateEncryptionKey();
        await storeEncryptionKey(newAccount, encryptionKey);
        console.log("Encryption key stored securely");

        // Encrypt private key
        console.log("Encrypting private key...");
        const encryptedPrivateKey = encryptData(privateKey, encryptionKey);
        console.log("Private key encrypted", encryptedPrivateKey);

        // Save encrypted private key to file system
        console.log("Saving encrypted private key to file system...");
        const accountFolder = `${FileSystem.documentDirectory}${did}/`;
        await FileSystem.makeDirectoryAsync(accountFolder, { intermediates: true });
        await FileSystem.writeAsStringAsync(`${accountFolder}privateKey.enc`, encryptedPrivateKey, { encoding: FileSystem.EncodingType.UTF8 });
        console.log("Encrypted private key saved");

        // Optionally save public key (unencrypted)
        console.log("Saving public key to file system...");
        await FileSystem.writeAsStringAsync(`${accountFolder}publicKey.json`, publicKey, { encoding: FileSystem.EncodingType.UTF8 });
        console.log("Public key saved");

        // Save account metadata
        const updatedAccounts = [...accounts, newAccount];
        setAccounts(updatedAccounts);

        console.log("Account created successfully", newAccount);
        console.log("Saving account metadata...");
        await storeAccountMetadata(updatedAccounts);
        console.log("Account metadata saved");

        setCurrentAccount(newAccount);
        await storeCurrentAccountDid(newAccount.did);
        setLoading(false);
    };

    // Login to an existing account by ID
    const login = async (accountId: string): Promise<void> => {
        const account = accounts.find((acc) => acc.did === accountId);
        if (account) {
            setCurrentAccount(account);
            await storeCurrentAccountDid(account.did);
        }
    };

    // Switch to a different account
    const switchAccount = async (accountId: string): Promise<void> => {
        await login(accountId);
    };

    // Logout current account
    const logout = async (): Promise<void> => {
        setCurrentAccount(null);
        await storeCurrentAccountDid(null);
    };

    // Update account settings
    const updateAccount = async (updatedAccount: Account): Promise<void> => {
        // Update the accounts array
        const updatedAccounts = accounts.map((acc) => (acc.did === updatedAccount.did ? updatedAccount : acc));
        setAccounts(updatedAccounts);
        await storeAccountMetadata(updatedAccounts);

        // If the `requireAuthentication` setting has changed, re-store the encryption key
        const encryptionKey = await retrieveEncryptionKey(updatedAccount);
        if (encryptionKey) {
            await storeEncryptionKey(updatedAccount, encryptionKey);
        }
    };

    // Sign a challenge using the current account's private key
    const signRequest = async (challenge: string): Promise<string | undefined> => {
        if (!currentAccount) return undefined;

        const account = currentAccount;
        const encryptionKey = await retrieveEncryptionKey(account);
        if (!encryptionKey) {
            // Handle error or authentication failure
            return undefined;
        }

        // Read encrypted private key
        const accountFolder = `${FileSystem.documentDirectory}${account.did}/`;
        const encryptedPrivateKey = await FileSystem.readAsStringAsync(`${accountFolder}privateKey.enc`, { encoding: FileSystem.EncodingType.UTF8 });

        // Decrypt private key
        const privateKeyJson = decryptData(encryptedPrivateKey, encryptionKey);

        // Create RSAKey instance and set the private key
        const rsa = new RSAKey();
        rsa.setPrivateString(privateKeyJson);

        // Sign the challenge
        const signature = rsa.sign(challenge);

        return signature;
    };

    return (
        <AuthContext.Provider
            value={{
                currentAccount,
                accounts,
                createAccount,
                login,
                switchAccount,
                logout,
                updateAccount,
                signRequest,
                loading,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = (): AuthContextType => {
    const context = useContext(AuthContext);
    if (!context) throw new Error("useAuth must be used within an AuthProvider");
    return context;
};
