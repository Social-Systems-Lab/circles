//_layout.tsx
import React from "react";
import { AuthProvider } from "@/components/auth/AuthContext";
import { Stack } from "expo-router";
import { WebViewProvider } from "@/components/ui/WebViewContext";

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
