//_layout.tsx
import React from "react";
import { AuthProvider } from "@/components/auth/auth-context";
import { Stack } from "expo-router";
import { WebViewProvider } from "@/components/ui/web-view-context";
import { StatusBar, useColorScheme } from "react-native";

export default function RootLayout() {
    const colorScheme = useColorScheme();

    return (
        <WebViewProvider>
            <AuthProvider>
                <StatusBar
                    backgroundColor={colorScheme === "light" ? "#FFFFFF" : "#1E293B"}
                    barStyle={colorScheme === "light" ? "dark-content" : "light-content"}
                    translucent={false}
                />
                <Stack screenOptions={{ headerShown: false }}>
                    <Stack.Screen name="index" />
                </Stack>
            </AuthProvider>
        </WebViewProvider>
    );
}
