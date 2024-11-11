import { AuthProvider } from "@/components/auth/AuthContext";
import { Stack } from "expo-router";

export default function RootLayout() {
    return (
        <AuthProvider>
            <Stack>
                <Stack.Screen name="index" />
            </Stack>
        </AuthProvider>
    );
}
