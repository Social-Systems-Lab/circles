// AuthContext.tsx

import React, { createContext, useContext, useState, useEffect } from "react";
import { Buffer } from "buffer";
import * as FileSystem from "expo-file-system";
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import { useWebView } from "../ui/WebViewContext";

// Polyfill Buffer for React Native if necessary
if (typeof Buffer === "undefined") {
    global.Buffer = require("buffer").Buffer;
}

type Account = {
    did: string;
    publicKey: string;
    name: string;
    handle?: string;
    picture?: string;
    requireAuthentication: boolean;
};

type AccountAndPrivateKey = Account & { privateKey: string };

type AuthContextType = {
    currentAccount: Account | null;
    accounts: Account[];
    createAccount: (account: AccountAndPrivateKey) => Promise<void>;
    signChallenge: (challenge: string, permissions: string[], isExternal: boolean) => Promise<void>;
    login: (accountDid: string, permissions: string[]) => Promise<void>;
    switchAccount: (accountDid: string) => Promise<void>;
    logout: () => Promise<void>;
    updateAccount: (updatedAccount: Account) => Promise<void>;
    loading: boolean;
    initialized: boolean;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [currentAccount, setCurrentAccount] = useState<Account | null>(null);
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [loading, setLoading] = useState<boolean>(false);
    const [initialized, setInitialized] = useState<boolean>(false);
    const { postMessageToWebView } = useWebView();

    // Storage Keys
    const ACCOUNTS_KEY = "accounts";
    const CURRENT_ACCOUNT_DID_KEY = "currentAccountDid";

    // Store accounts in AsyncStorage
    const storeAccounts = async (accounts: Account[]): Promise<void> => {
        await AsyncStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
    };

    const loadAccounts = async (): Promise<Account[]> => {
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

    // Initialize on component mount
    useEffect(() => {
        console.log("Initializing AuthProvider");

        const initialize = async (): Promise<void> => {
            setLoading(true);

            console.log("Clearing accounts...");
            //await AsyncStorage.setItem(ACCOUNTS_KEY, "");

            const loadedAccounts = await loadAccounts();
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
            setInitialized(true);
        };
        initialize();
    }, []);

    const encrypt = async (data: string, key: Uint8Array): Promise<string> => {
        return data; // TODO Implement encryption
    };

    const decrypt = async (data: string, key: Uint8Array): Promise<string> => {
        return data; // TODO Implement decryption
    };

    // Create a new account
    const createAccount = async (account: AccountAndPrivateKey): Promise<void> => {
        setLoading(true);

        console.log("Creating new account");
        let did = account.did;
        let privateKey = account.privateKey;
        let publicKey = account.publicKey;

        // Generate and store encryption key
        console.log("Storing encryption key...");
        let encryptionKey = await generateEncryptionKey();
        await storeEncryptionKey(account, encryptionKey);

        // Encrypt private key
        console.log("Encrypting private key...");
        let encryptedPrivateKey = await encrypt(privateKey, encryptionKey);

        // Save encrypted private key to file system
        console.log("Saving encrypted private key to file system...");
        const accountFolder = `${FileSystem.documentDirectory}${did}/`;
        await FileSystem.makeDirectoryAsync(accountFolder, { intermediates: true });
        await FileSystem.writeAsStringAsync(`${accountFolder}privateKey.pem.enc`, encryptedPrivateKey, { encoding: FileSystem.EncodingType.UTF8 });
        console.log("Encrypted private key saved");

        // Save public key to file system
        console.log("Saving public key to file system...");
        await FileSystem.writeAsStringAsync(`${accountFolder}publicKey.pem`, publicKey, { encoding: FileSystem.EncodingType.UTF8 });
        console.log("Public key saved");

        // Save account data
        let newAccount: Account = {
            did,
            publicKey,
            name: account.name,
            handle: account.handle,
            picture: account.picture,
            requireAuthentication: account.requireAuthentication,
        };
        const updatedAccounts = [...accounts, newAccount];
        setAccounts(updatedAccounts);

        console.log("Account created successfully");
        console.log("Saving account data...");
        await storeAccounts(updatedAccounts);
        setCurrentAccount(account);

        console.log("Saving DID...");
        await storeCurrentAccountDid(account.did);
        setLoading(false);
        console.log("Done.");
    };

    const signChallenge = async (challenge: string, permissions: string[], isExternal: boolean): Promise<void> => {
        console.log("Signing challenge...");

        if (!currentAccount) {
            return;
        }

        // get private key from file system
        const did = currentAccount?.did;
        const accountFolder = `${FileSystem.documentDirectory}${did}/`;
        const encryptedPrivateKey = await FileSystem.readAsStringAsync(`${accountFolder}privateKey.pem.enc`, { encoding: FileSystem.EncodingType.UTF8 });

        // decrypt private key
        const encryptionKey = await retrieveEncryptionKey(currentAccount);
        if (!encryptionKey) {
            console.error("Encryption key not found.");
            return;
        }
        const privateKey = await decrypt(encryptedPrivateKey, encryptionKey);

        // Send to webview for signing
        postMessageToWebView({
            type: "SignChallenge",
            challenge,
            permissions,
            isExternal,
            privateKey,
            publicKey: currentAccount?.publicKey,
            currentAccount: isExternal ? null : currentAccount,
        });

        // const signedChallenge = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, challenge);
        // // convert to base64
        // // const signedChallengeBase64 = Buffer.from(signedChallenge, "hex").toString("base64");
        // console.log("Done.");

        // if (notifyWebview) {
        //     // Send signed challenge back to WebView
        //     postMessageToWebView({
        //         type: "QRCodeChallengeSigned",
        //         signature: signedChallenge,
        //         publicKey: currentAccount?.publicKey,
        //         challenge: challenge,
        //         isExternal,
        //     });
        // }

        //        return signedChallenge;
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
        await storeAccounts(updatedAccounts);

        // If the `requireAuthentication` setting has changed, re-store the encryption key
        const encryptionKey = await retrieveEncryptionKey(updatedAccount);
        if (encryptionKey) {
            await storeEncryptionKey(updatedAccount, encryptionKey);
        }
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
                loading,
                initialized,
                signChallenge,
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
