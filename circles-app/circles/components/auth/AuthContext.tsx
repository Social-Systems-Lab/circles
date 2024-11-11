import React, { createContext, useContext, useState, useEffect } from "react";
import * as FileSystem from "expo-file-system";
import * as Crypto from "expo-crypto";
import RSAKey from "react-native-rsa-expo";
import { ActivityIndicator, View, Text } from "react-native";

const SALT_FILENAME = "salt.bin";
const IV_FILENAME = "iv.bin";
const PUBLIC_KEY_FILENAME = "publicKey.pem";
const PRIVATE_KEY_FILENAME = "privateKey.pem";
const ENCRYPTED_PRIVATE_KEY_FILENAME = "privateKey.pem.enc";

type Account = {
    id: string;
    name: string;
    publicKey: string;
};

type AuthContextType = {
    currentAccount: Account | null;
    accounts: Account[];
    login: (name: string) => Promise<void>;
    switchAccount: (accountId: string) => void;
    logout: () => void;
    signRequest: (challenge: string) => Promise<string | null>;
    loading: boolean;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [currentAccount, setCurrentAccount] = useState<Account | null>(null);
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [loading, setLoading] = useState(false); // Loading state for key generation

    const SALT = "somesecureandsaltingvalue"; // Use a more secure, random salt in production

    const encrypt = async (data: string) => {
        const iv = Crypto.getRandomBytes(16); // Initialization vector
        const key = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, SALT);

        const encryptedData = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, data + key);

        return { encryptedData, iv };
    };

    const storePrivateKey = async (privateKey: string, fileName: string) => {
        const { encryptedData, iv } = await encrypt(privateKey);
        const fileUri = FileSystem.documentDirectory + fileName;

        await FileSystem.writeAsStringAsync(fileUri, encryptedData, {
            encoding: FileSystem.EncodingType.UTF8,
        });
        return fileUri;
    };

    const login = async (name: string) => {
        setLoading(true); // Show loading indicator

        // Simulate RSA key generation and account creation
        const publicKey = "publicKey";
        const newAccount: Account = {
            id: "did:" + Date.now().toString(),
            name,
            publicKey,
        };

        // delay for 2 seconds
        await new Promise((resolve) => setTimeout(resolve, 2000));

        const updatedAccounts = [...accounts, newAccount];
        setAccounts(updatedAccounts);
        setCurrentAccount(newAccount);

        setLoading(false); // Hide loading indicator
    };

    const switchAccount = (accountId: string) => {
        const account = accounts.find((acc) => acc.id === accountId);
        if (account) setCurrentAccount(account);
    };

    const logout = () => {
        setCurrentAccount(null);
    };

    const signRequest = async (challenge: string) => {
        if (!currentAccount) return null;
        // Logic to read, decrypt, and use private key for signing (not implemented in this example)
        return null;
    };

    return (
        <AuthContext.Provider
            value={{
                currentAccount,
                accounts,
                login,
                switchAccount,
                logout,
                signRequest,
                loading,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) throw new Error("useAuth must be used within an AuthProvider");
    return context;
};
