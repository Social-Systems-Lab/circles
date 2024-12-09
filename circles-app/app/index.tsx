// import React, { useState, useTransition } from "react";
// import { Button, View, Text, ActivityIndicator } from "react-native";
// import { RsaKeys, useJsrsaWebView } from "@/components/ui/JsrsaWebViewContext";

// export default function Index() {
//     const { generateRSAKeys, signChallenge } = useJsrsaWebView();
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

// index.tsx
import React, { useState, useRef, useEffect } from "react";
import { View, TextInput, TouchableOpacity, Image, Modal, StyleSheet, StatusBar } from "react-native";
import { useAuth } from "../components/auth/AuthContext";
import { WebView, WebViewMessageEvent } from "react-native-webview";
import { useCameraPermissions } from "expo-camera";
import { useRouter } from "expo-router";
import { useWebView } from "@/components/ui/WebViewContext";

//const circlesUrl = "http://192.168.10.204:3000"; // circles running locally
const circlesUrl = "https://makecircles.org/feeds"; // circles prod server

export default function Index() {
    const router = useRouter();
    const { accounts, currentAccount, createAccount, signChallenge, initialized } = useAuth();
    const { webViewRef } = useWebView();
    // const webViewRef = useRef<WebView>(null);
    const [jsCode, setJsCode] = useState<string | undefined>(undefined);
    const [permission, requestPermission] = useCameraPermissions();

    // Function to inject accounts into the web app
    useEffect(() => {
        if (!initialized) return;

        const accountsData = accounts.map((account) => ({
            did: account.did,
            name: account.name,
        }));

        console.log("Injecting accounts data", accountsData, currentAccount);

        const jsCode = `
        (function() {
            window._SSI_ACCOUNTS = ${JSON.stringify(accountsData)};
            window._SSI_CURRENT_ACCOUNT = ${JSON.stringify(currentAccount)};
        })();
        `;
        setJsCode(jsCode);
    }, [initialized]);

    // Handle messages from the WebView
    const handleWebViewMessage = async (event: WebViewMessageEvent) => {
        try {
            const data = JSON.parse(event.nativeEvent.data);
            if (data.type === "CreateAccount") {
                // console.log("[CreateAccount]:", data);
                const { account } = data;
                await createAccount(account);
            } else if (data.type === "SignChallenge") {
                console.log("TODO [SignChallenge]:", data);
                await signChallenge(data.challenge, [], false);
            } else if (data.type === "Log") {
                // Log messages from the WebView
                console.log("[WebView]: " + data.message, data.optionalParams);
            } else if (data.type === "Loaded") {
                // The web app has loaded
                console.log("[WebView]: Loaded");
            } else if (data.type === "ScanQRCode") {
                console.log("[WebView]: User requests to scan QR code");
                if (!permission?.granted) {
                    console.log("Requesting camera permission");
                    let res = await requestPermission();
                    if (!res.granted) {
                        console.log("Camera permission denied");
                        return;
                    }
                }
                // open QR scanner
                router.push("/qr-scanner");
            }
        } catch (error) {
            console.error("Error parsing message from WebView:", error);
        }
    };

    return (
        <View style={{ flex: 1 }}>
            <StatusBar backgroundColor="white" barStyle="dark-content" />
            {jsCode && (
                <WebView ref={webViewRef} source={{ uri: circlesUrl }} style={{ flex: 1 }} onMessage={handleWebViewMessage} injectedJavaScript={jsCode} />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    // Your styles here
});
