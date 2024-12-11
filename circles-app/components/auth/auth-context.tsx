// AuthContext.tsx - RSA key generation and signing context
// Uses a WebView to interact with the jsrsasign library

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import { Buffer } from "buffer";
import * as FileSystem from "expo-file-system";
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import { useWebView } from "../ui/web-view-context";
import { View, StyleSheet } from "react-native";
import WebView from "react-native-webview";
import { Asset } from "expo-asset";

// Polyfill Buffer for React Native if necessary
if (typeof Buffer === "undefined") {
    global.Buffer = require("buffer").Buffer;
}

export type MessageType = {
    action: string;
    payload?: any;
};

export type RsaKeys = {
    publicKey: string;
    privateKey: string;
};

export type AuthType = "PIN" | "BIOMETRIC";

export type Account = {
    did: string;
    publicKey: string;
    name: string;
    requireAuthentication: AuthType;
};

type AuthContextType = {
    jsrsaWebViewRef: React.RefObject<WebView>;
    generateRSAKeys: () => Promise<RsaKeys>;
    signChallenge: (privateKey: string, challenge: string) => Promise<string>;
    accounts: Account[];
    currentAccount: Account | null;
    createAccount: (accountName: string, authType: AuthType, pin?: string) => Promise<void>;
    encryptData: (data: string) => Promise<string>;
    decryptData: (encryptedData: string) => Promise<string>;
    login: (accountDid: string, pin?: string) => Promise<void>;
    logout: () => Promise<void>;
    loading: boolean;
    initialized: boolean;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export type AccountWithEncryptionKey = Account & { encryptionKey: string };

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    // jsrsawebview
    const jsrsaWebViewRef = useRef<WebView>(null);
    const jsrsasignHtmlUri = Asset.fromModule(require("@/assets/auth/jsrsasign.html")).uri;
    const pendingRequests = useRef<{ [key: string]: (value: any) => void }>({});
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [currentAccount, setCurrentAccount] = useState<AccountWithEncryptionKey | null>(null);
    const [loading, setLoading] = useState<boolean>(false);
    const [initialized, setInitialized] = useState<boolean>(false);

    const ACCOUNTS_KEY = "accounts";

    const callWebViewFunction = useCallback((message: { action: string; payload?: any }) => {
        return new Promise<any>((resolve, reject) => {
            const requestId = Date.now().toString(); // Unique request ID
            pendingRequests.current[requestId] = resolve;

            console.log("callWebViewFunction", JSON.stringify({ ...message, requestId }));

            jsrsaWebViewRef.current?.injectJavaScript(`
                    window.dispatchEvent(new MessageEvent('message', {
                        data: ${JSON.stringify({ ...message, requestId })}
                    }));
                `);

            // timeout to reject if no response is received
            setTimeout(() => {
                if (pendingRequests.current[requestId]) {
                    delete pendingRequests.current[requestId];
                    reject(new Error("WebView function timed out"));
                }
            }, 60000); // 60 seconds timeout
        });
    }, []);

    const generateRSAKeys = useCallback(() => {
        return callWebViewFunction({ action: "generateRSAKeys" });
    }, [callWebViewFunction]);

    const signChallenge = useCallback(
        (privateKey: string, challenge: string) => {
            return callWebViewFunction({
                action: "signChallenge",
                payload: { privateKey, challenge },
            });
        },
        [callWebViewFunction]
    );

    const storeAccounts = async (accounts: Account[]): Promise<void> => {
        await AsyncStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
    };

    const loadAccounts = async (): Promise<Account[]> => {
        const data = await AsyncStorage.getItem(ACCOUNTS_KEY);
        return data ? JSON.parse(data) : [];
    };

    const generateEncryptionKey = async (): Promise<string> => {
        let keyBytes = await Crypto.getRandomBytesAsync(32);
        console.log("RAW key" + keyBytes);
        return Buffer.from(keyBytes).toString("base64");
    };

    const printKeyAsCharacters = (base64Key: string) => {
        // Decode Base64 to raw bytes
        const buffer = Buffer.from(base64Key, "base64");

        // Convert bytes to characters
        const keyAsChars = String.fromCharCode(...buffer);

        console.log("Key as characters (32 bytes):", keyAsChars);
    };

    const storeEncryptionKey = async (account: Account, encryptionKey: string, pin?: string): Promise<void> => {
        const secureStoreKey = account.did.replace(/[^a-zA-Z0-9._-]/g, "");
        if (account.requireAuthentication === "PIN" && pin) {
            const encryptedKeyWithPin = await encryptDataWithEncryptionKey(encryptionKey, pin);
            await SecureStore.setItemAsync(secureStoreKey, encryptedKeyWithPin);
        } else {
            await SecureStore.setItemAsync(secureStoreKey, encryptionKey, {
                requireAuthentication: true,
            });
        }
    };

    const retrieveEncryptionKey = async (account: Account, pin?: string): Promise<string> => {
        const secureStoreKey = account.did.replace(/[^a-zA-Z0-9._-]/g, "");
        const storedEncryptionKey = await SecureStore.getItemAsync(secureStoreKey, {
            requireAuthentication: account.requireAuthentication === "BIOMETRIC",
        });
        if (!storedEncryptionKey) {
            throw new Error("Encryption key not found");
        }
        if (account.requireAuthentication === "PIN" && pin) {
            return await decryptDataWithEncryptionKey(storedEncryptionKey, pin);
        }
        return storedEncryptionKey;
    };

    const encryptDataWithEncryptionKey = useCallback(
        async (data: string, encryptionKey: string): Promise<string> => {
            return callWebViewFunction({
                action: "encryptData",
                payload: { data, encryptionKey },
            });
        },
        [callWebViewFunction]
    );

    const decryptDataWithEncryptionKey = useCallback(
        async (encryptedData: string, encryptionKey: string): Promise<string> => {
            return callWebViewFunction({
                action: "decryptData",
                payload: { encryptedData, encryptionKey },
            });
        },
        [callWebViewFunction]
    );

    const encryptData = async (data: string): Promise<string> => {
        if (!currentAccount) throw new Error("No account selected");
        return encryptDataWithEncryptionKey(data, currentAccount.encryptionKey);
    };

    const decryptData = async (encryptedData: string): Promise<string> => {
        if (!currentAccount) throw new Error("No account selected");
        return decryptDataWithEncryptionKey(encryptedData, currentAccount.encryptionKey);
    };

    const generateDid = async (publicKey: string): Promise<string> => {
        // Hash the public key using SHA-256
        const hash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, publicKey);

        // Convert the hash to Base64 and make it URL safe
        const base64Url = Buffer.from(hash, "hex")
            .toString("base64")
            .replace(/\+/g, "-") // Replace + with -
            .replace(/\//g, "_") // Replace / with _
            .replace(/=+$/, ""); // Remove trailing =

        // Prefix the result to form a DID
        return `did:circles:${base64Url}`;
    };

    const createAccount = async (accountName: string, authType: AuthType, pin?: string) => {
        setLoading(true);
        const rsaKeys = await generateRSAKeys();
        const encryptionKey = await generateEncryptionKey();
        const encryptedPrivateKey = await encryptDataWithEncryptionKey(rsaKeys.privateKey, encryptionKey);

        const did = await generateDid(rsaKeys.publicKey);
        const newAccount: Account = {
            did,
            publicKey: rsaKeys.publicKey,
            name: accountName,
            requireAuthentication: authType,
        };

        const accountFolder = `${FileSystem.documentDirectory}${did}/`;
        await FileSystem.makeDirectoryAsync(accountFolder, { intermediates: true });
        await FileSystem.writeAsStringAsync(`${accountFolder}privateKey.pem.enc`, encryptedPrivateKey);
        await storeEncryptionKey(newAccount, encryptionKey, pin);

        const updatedAccounts = [...accounts, newAccount];
        setAccounts(updatedAccounts);
        await storeAccounts(updatedAccounts);

        let accountWithPrivateKey: AccountWithEncryptionKey = { ...newAccount, encryptionKey };
        setCurrentAccount(accountWithPrivateKey);
        setLoading(false);
    };

    const login = async (accountDid: string, pin?: string) => {
        const account = accounts.find((acc) => acc.did === accountDid);
        if (!account) throw new Error("Account not found");
        const encryptionKey = await retrieveEncryptionKey(account, pin);
        setCurrentAccount({ ...account, encryptionKey });
    };

    const logout = async () => {
        setCurrentAccount(null);
    };

    useEffect(() => {
        const initialize = async () => {
            setLoading(true);
            const loadedAccounts = await loadAccounts();
            setAccounts(loadedAccounts);
            setInitialized(true);
            setLoading(false);
        };
        initialize();
    }, []);

    return (
        <AuthContext.Provider
            value={{
                jsrsaWebViewRef,
                generateRSAKeys,
                signChallenge,
                accounts,
                currentAccount,
                createAccount,
                encryptData,
                decryptData,
                login,
                logout,
                loading,
                initialized,
            }}
        >
            <View style={styles.hidden}>
                <WebView
                    ref={jsrsaWebViewRef}
                    source={{ uri: jsrsasignHtmlUri }}
                    javaScriptEnabled
                    onMessage={(event) => {
                        console.log("onMessage", event.nativeEvent.data);
                        const { requestId, response } = JSON.parse(event.nativeEvent.data);

                        // resolve the corresponding Promise
                        if (requestId && pendingRequests.current[requestId]) {
                            pendingRequests.current[requestId](response);
                            delete pendingRequests.current[requestId];
                        }
                    }}
                />
            </View>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = (): AuthContextType => {
    const context = useContext(AuthContext);
    if (!context) throw new Error("useAuth must be used within an AuthProvider");
    return context;
};

const styles = StyleSheet.create({
    hidden: {
        height: 0,
        width: 0,
        position: "absolute",
        top: -10000, // hide webview off-screen
    },
});
