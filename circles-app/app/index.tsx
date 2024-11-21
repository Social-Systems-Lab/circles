// index.tsx
import React, { useState, useRef, useEffect } from "react";
import { View, TextInput, TouchableOpacity, Image, Modal, StyleSheet, StatusBar } from "react-native";
import { useAuth } from "../components/auth/AuthContext";
import { WebView, WebViewMessageEvent } from "react-native-webview";

const circlesUrl = "http://192.168.10.204:3000";

export default function Index() {
    const { accounts, currentAccount, createAccount, signChallenge, initialized } = useAuth();
    const webViewRef = useRef<WebView>(null);
    const [jsCode, setJsCode] = useState<string | undefined>(undefined);

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

                // console.log("Sending message to WebView", webViewRef.current);
                // webViewRef.current?.injectJavaScript(`
                //     window.dispatchEvent(new MessageEvent('message', {
                //         data: ${JSON.stringify({ type: "ChallengeSigned", signedChallenge })}
                //     }));
                // `);
                // webViewRef.current?.postMessage(JSON.stringify({ type: "ChallengeSigned", signedChallenge }));
            } else if (data.type === "SignChallenge") {
                console.log("TODO [SignChallenge]:", data);
                let signedChallenge = await signChallenge(data.challenge, []);

                // Send signed challenge back to WebView
                webViewRef.current?.injectJavaScript(`
                    window.dispatchEvent(new MessageEvent('message', {
                        data: ${JSON.stringify({ type: "ChallengeSigned", signedChallenge })}
                    }));
                `);

                // webViewRef.current?.postMessage(JSON.stringify({ type: "ChallengeSigned", signedChallenge }));
            } else if (data.type === "Log") {
                // Log messages from the WebView
                console.log("[WebView]: " + data.message, data.optionalParams);
            } else if (data.type === "Loaded") {
                // The web app has loaded
                console.log("[WebView]: Loaded");
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
