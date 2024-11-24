import React, { createContext, useContext, useRef } from "react";
import WebView from "react-native-webview";

export type WebViewContextType = {
    webViewRef: React.RefObject<WebView>;
    postMessageToWebView: (message: object) => void;
};
const WebViewContext = createContext<WebViewContextType | undefined>(undefined);

export const WebViewProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const webViewRef = useRef<WebView>(null);

    const postMessageToWebView = (message: object) => {
        console.log("postMessageToWebView", message);
        webViewRef.current?.injectJavaScript(`
            window.dispatchEvent(new MessageEvent('message', {
                data: ${JSON.stringify(message)}
            }));
        `);
    };

    return <WebViewContext.Provider value={{ webViewRef, postMessageToWebView }}>{children}</WebViewContext.Provider>;
};

export const useWebView = () => {
    const context = useContext(WebViewContext);
    if (!context) {
        throw new Error("useWebView must be used within a WebViewProvider");
    }
    return context;
};
