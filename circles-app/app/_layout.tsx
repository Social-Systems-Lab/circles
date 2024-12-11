//_layout.tsx
import React from "react";
import { AuthProvider } from "@/components/auth/auth-context";
import { Stack } from "expo-router";
import { WebViewProvider } from "@/components/ui/web-view-context";

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
