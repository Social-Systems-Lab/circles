import React, { useState } from "react";
import { ScrollView, View, Text, TextInput, Button, ActivityIndicator } from "react-native";
import { useAuth, AuthType } from "@/components/auth/auth-context";

export default function TestScreen() {
    const { createAccount, login, logout, accounts, currentAccount, encryptData, decryptData } = useAuth();

    const [accountName, setAccountName] = useState<string>("");
    const [authType, setAuthType] = useState<AuthType>("BIOMETRIC");
    const [pin, setPin] = useState<string>("");

    const [dataToEncrypt, setDataToEncrypt] = useState<string>("");
    const [encryptedData, setEncryptedData] = useState<string | null>(null);
    const [decryptedData, setDecryptedData] = useState<string | null>(null);

    const [isLoading, setIsLoading] = useState<boolean>(false);

    const handleCreateAccount = async () => {
        setIsLoading(true);
        try {
            await createAccount(accountName, authType, authType === "PIN" ? pin : undefined);
            console.log("Account created successfully.");
        } catch (error) {
            console.error("Error creating account:", error);
        }
        setIsLoading(false);
    };

    const handleLogin = async (did: string) => {
        setIsLoading(true);
        try {
            await login(did, authType === "PIN" ? pin : undefined);
            console.log("Logged into account:", did);
        } catch (error) {
            console.error("Error logging into account:", error);
        }
        setIsLoading(false);
    };

    const handleEncryptData = async () => {
        setIsLoading(true);
        try {
            if (!currentAccount) {
                console.error("No account selected");
                return;
            }
            const encrypted = await encryptData(dataToEncrypt);
            setEncryptedData(encrypted);
        } catch (error) {
            console.error("Error encrypting data:", error);
        }
        setIsLoading(false);
    };

    const handleDecryptData = async () => {
        setIsLoading(true);
        try {
            if (!encryptedData) {
                console.error("No encrypted data to decrypt");
                return;
            }
            const decrypted = await decryptData(encryptedData);
            setDecryptedData(decrypted);
        } catch (error) {
            console.error("Error decrypting data:", error);
        }
        setIsLoading(false);
    };

    const handleLogout = async () => {
        setIsLoading(true);
        try {
            await logout();
            console.log("Logged out successfully.");
        } catch (error) {
            console.error("Error logging out:", error);
        }
        setIsLoading(false);
    };

    return (
        <ScrollView contentContainerStyle={{ padding: 16 }}>
            <Text>Current Account:</Text>
            {currentAccount ? (
                <View>
                    <Text>Name: {currentAccount.name}</Text>
                    <Text>DID: {currentAccount.did}</Text>
                </View>
            ) : (
                <Text>No account logged in</Text>
            )}

            <TextInput placeholder="Account Name" value={accountName} onChangeText={setAccountName} style={{ borderBottomWidth: 1, marginVertical: 8 }} />
            <Text>Auth Type:</Text>
            <Button
                title={authType === "BIOMETRIC" ? "Switch to PIN" : "Switch to Biometric"}
                onPress={() => setAuthType(authType === "BIOMETRIC" ? "PIN" : "BIOMETRIC")}
            />
            {authType === "PIN" && (
                <TextInput placeholder="PIN" value={pin} onChangeText={setPin} secureTextEntry style={{ borderBottomWidth: 1, marginVertical: 8 }} />
            )}
            <Button title="Create Account" onPress={handleCreateAccount} />

            <Text>Accounts:</Text>
            {accounts.map((account) => (
                <View key={account.did} style={{ marginVertical: 4 }}>
                    <Text>
                        {account.name} (DID: {account.did.slice(0, 10)}...)
                    </Text>
                    <Button title="Login to this account" onPress={() => handleLogin(account.did)} />
                </View>
            ))}

            <TextInput
                placeholder="Data to Encrypt"
                value={dataToEncrypt}
                onChangeText={setDataToEncrypt}
                style={{ borderBottomWidth: 1, marginVertical: 8 }}
            />
            <Button title="Encrypt Data" onPress={handleEncryptData} />
            <Text>Encrypted Data: {encryptedData ? encryptedData.slice(0, 20) + "..." : "N/A"}</Text>
            <Button title="Decrypt Data" onPress={handleDecryptData} />
            <Text>Decrypted Data: {decryptedData ? decryptedData : "N/A"}</Text>

            <Button title="Logout" onPress={handleLogout} />

            {isLoading && <ActivityIndicator size="large" color="#0000ff" />}
        </ScrollView>
    );
}
