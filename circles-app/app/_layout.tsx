//_layout.tsx
import React from "react";
import { AuthProvider } from "@/components/auth/AuthContext";
import { Stack } from "expo-router";
import { WebViewProvider } from "@/components/ui/WebViewContext";
import { JsrsaWebViewProvider } from "@/components/ui/JsrsaWebViewContext";

// TODO we can wrap JsrsaWebViewProvider into AuthProvider and WebViewProvider can be called CirclesWebViewProvider or something like that, which
// will be responsible for the WebView that is used to interact with the Circles app

export default function RootLayout() {
    return (
        <WebViewProvider>
            <AuthProvider>
                <Stack screenOptions={{ headerShown: false }}>
                    <Stack.Screen name="index" />
                </Stack>
            </AuthProvider>
        </WebViewProvider>
    );
}

{
    /* <JsrsaWebViewProvider>
<Stack screenOptions={{ headerShown: false }}>
    <Stack.Screen name="index" />
</Stack>
</JsrsaWebViewProvider> */
}
