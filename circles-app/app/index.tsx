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

// import { useAuth } from "@/components/auth/auth-context";
// import { useRouter } from "expo-router";
// import { useEffect } from "react";

// export default function Index() {
//     const router = useRouter();
//     const { accounts } = useAuth();

//     useEffect(() => {
//         if (accounts.length === 0) {
//             // show account create wizard
//             router.replace("/accounts/wizard");
//         } else if (accounts.length === 1) {
//             // log into the only account
//             router.replace("/main");
//         } else {
//             // show account selection screen
//             router.replace("/accounts/select");
//         }
//     }, [accounts]);

//     return null; // Empty screen while determining redirection
// }

// import { RsaKeys, useAuth } from "@/components/auth/auth-context";
// import React, { useState, useTransition } from "react";
// import { Button, View, Text, ActivityIndicator } from "react-native";

// export default function Index() {
//     const { generateRSAKeys, signChallenge } = useAuth();
//     const [keys, setKeys] = useState<RsaKeys | null>(null);
//     const [signature, setSignature] = useState<string | null>(null);
//     const [isLoading, setIsLoading] = useState<boolean>(false);

//     const handleGenerateKeys = async () => {
//         setIsLoading(true);
//         try {
//             console.log("Generating RSA keys...");
//             const response = await generateRSAKeys();
//             setKeys(response);
//         } catch (error) {
//             console.error("Error generating RSA keys:", error);
//         }
//         setIsLoading(false);
//     };

//     const handleSignChallenge = async () => {
//         setIsLoading(true);
//         try {
//             if (!keys) {
//                 console.error("No RSA keys generated");
//                 return;
//             }
//             console.log("Signing challenge...");
//             const response = await signChallenge(keys.privateKey, "test challenge");
//             console.log("signChallenge response...", response);
//             setSignature(response);
//         } catch (error) {
//             console.error("Error signing challenge:", error);
//         }
//         setIsLoading(false);
//     };

//     return (
//         <View>
//             <Text>Public Key: {keys ? keys?.publicKey?.slice(0, 20) + "..." : ""}</Text>
//             <Text>Private Key: {keys ? keys?.privateKey?.slice(0, 20) + "..." : ""}</Text>
//             <Text>Signature: {signature ? signature?.slice(0, 20) + "..." : ""}</Text>
//             <Button title="Generate RSA Keys" onPress={handleGenerateKeys} />
//             <Button title="Sign Challenge" onPress={handleSignChallenge} />
//             {isLoading && <ActivityIndicator size="large" color="#0000ff" />}
//         </View>
//     );
// }

// // index.tsx
// import React, { useState, useRef, useEffect } from "react";
// import { View, TextInput, TouchableOpacity, Image, Modal, StyleSheet, StatusBar } from "react-native";
// import { useAuth } from "../components/auth/auth-context";
// import { WebView, WebViewMessageEvent } from "react-native-webview";
// import { useCameraPermissions } from "expo-camera";
// import { useRouter } from "expo-router";
// import { useWebView } from "@/components/ui/web-view-context";

// const circlesUrl = "http://192.168.10.204:3000"; // circles running locally
// //const circlesUrl = "https://makecircles.org/feeds"; // circles prod server

// export default function Index() {
//     const router = useRouter();
//     // const { accounts, currentAccount, createAccount, signChallenge, initialized } = useAuth();
//     const { webViewRef } = useWebView();
//     // const webViewRef = useRef<WebView>(null);
//     const [jsCode, setJsCode] = useState<string | undefined>(undefined);
//     const [permission, requestPermission] = useCameraPermissions();

//     // Function to inject accounts into the web app
//     // useEffect(() => {
//     //     if (!initialized) return;

//     //     const accountsData = accounts.map((account) => ({
//     //         did: account.did,
//     //         name: account.name,
//     //     }));

//     //     console.log("Injecting accounts data", accountsData, currentAccount);

//     //     const jsCode = `
//     //     (function() {
//     //         window._SSI_ACCOUNTS = ${JSON.stringify(accountsData)};
//     //         window._SSI_CURRENT_ACCOUNT = ${JSON.stringify(currentAccount)};
//     //     })();
//     //     `;
//     //     setJsCode(jsCode);
//     // }, [initialized]);

//     const handleWebViewMessage = async (event: WebViewMessageEvent) => {};

//     // Handle messages from the WebView
//     // const handleWebViewMessage = async (event: WebViewMessageEvent) => {
//     //     try {
//     //         const data = JSON.parse(event.nativeEvent.data);
//     //         if (data.type === "CreateAccount") {
//     //             // console.log("[CreateAccount]:", data);
//     //             const { account } = data;
//     //             await createAccount(account);
//     //         } else if (data.type === "SignChallenge") {
//     //             console.log("TODO [SignChallenge]:", data);
//     //             await signChallenge(data.challenge, [], false);
//     //         } else if (data.type === "Log") {
//     //             // Log messages from the WebView
//     //             console.log("[WebView]: " + data.message, data.optionalParams);
//     //         } else if (data.type === "Loaded") {
//     //             // The web app has loaded
//     //             console.log("[WebView]: Loaded");
//     //         } else if (data.type === "ScanQRCode") {
//     //             console.log("[WebView]: User requests to scan QR code");
//     //             if (!permission?.granted) {
//     //                 console.log("Requesting camera permission");
//     //                 let res = await requestPermission();
//     //                 if (!res.granted) {
//     //                     console.log("Camera permission denied");
//     //                     return;
//     //                 }
//     //             }
//     //             // open QR scanner
//     //             router.push("/qr-scanner");
//     //         }
//     //     } catch (error) {
//     //         console.error("Error parsing message from WebView:", error);
//     //     }
//     // };

//     return (
//         <View style={{ flex: 1 }}>
//             <StatusBar backgroundColor="white" barStyle="dark-content" />
//             {jsCode && (
//                 <WebView ref={webViewRef} source={{ uri: circlesUrl }} style={{ flex: 1 }} onMessage={handleWebViewMessage} injectedJavaScript={jsCode} />
//             )}
//         </View>
//     );
// }
