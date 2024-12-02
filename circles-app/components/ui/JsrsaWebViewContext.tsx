// JsrsaWebViewContext.tsx - Context for the WebView component that uses the jsrsasign library for generating RSA keys and signing data
import React, { createContext, useCallback, useContext, useRef } from "react";
import { View, StyleSheet } from "react-native";
import WebView from "react-native-webview";
import { Asset } from "expo-asset";

export type MessageType = {
    action: string;
    payload?: any;
};

export type RsaKeys = {
    publicKey: string;
    privateKey: string;
};

export type JsrsaWebViewContextType = {
    webViewRef: React.RefObject<WebView>;
    generateRSAKeys: () => Promise<RsaKeys>;
    signChallenge: (privateKey: string, challenge: string) => Promise<string>;
};
const JsrsaWebViewContext = createContext<JsrsaWebViewContextType | undefined>(undefined);

export const JsrsaWebViewProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const webViewRef = useRef<WebView>(null);
    const jsrsasignHtmlUri = Asset.fromModule(require("@/assets/auth/jsrsasign.html")).uri;
    const pendingRequests = useRef<{ [key: string]: (value: any) => void }>({});

    const callWebViewFunction = useCallback((message: { action: string; payload?: any }) => {
        return new Promise<any>((resolve) => {
            const requestId = Date.now().toString(); // Unique request ID
            pendingRequests.current[requestId] = resolve;

            console.log("callWebViewFunction", JSON.stringify({ ...message, requestId }));

            webViewRef.current?.injectJavaScript(`
                    window.dispatchEvent(new MessageEvent('message', {
                        data: ${JSON.stringify({ ...message, requestId })}
                    }));
                `);
        });
    }, []);

    // Typed function for generating RSA keys
    const generateRSAKeys = useCallback(() => {
        return callWebViewFunction({ action: "generateRSAKeys" });
    }, [callWebViewFunction]);

    // Typed function for signing a challenge
    const signChallenge = useCallback(
        (privateKey: string, challenge: string) => {
            return callWebViewFunction({
                action: "signChallenge",
                payload: { privateKey, challenge },
            });
        },
        [callWebViewFunction]
    );

    return (
        <JsrsaWebViewContext.Provider value={{ webViewRef, generateRSAKeys, signChallenge }}>
            <View style={styles.hidden}>
                <WebView
                    ref={webViewRef}
                    source={{ uri: jsrsasignHtmlUri }}
                    javaScriptEnabled
                    onMessage={(event) => {
                        console.log("onMessage", event.nativeEvent.data);

                        const { requestId, response } = JSON.parse(event.nativeEvent.data);

                        // resolve the corresponding Promise
                        if (requestId && pendingRequests.current[requestId]) {
                            console.log("Resolving request", requestId);
                            pendingRequests.current[requestId](response);
                            delete pendingRequests.current[requestId];
                        }
                    }}
                />
            </View>
            {children}
        </JsrsaWebViewContext.Provider>
    );
};

export const useJsrsaWebView = () => {
    const context = useContext(JsrsaWebViewContext);
    if (!context) {
        throw new Error("useJsrsaWebView must be used within a JsrsaWebViewProvider");
    }
    return context;
};

const styles = StyleSheet.create({
    hidden: {
        height: 0,
        width: 0,
        position: "absolute",
        top: -10000, // Ensure it's off-screen
    },
});
