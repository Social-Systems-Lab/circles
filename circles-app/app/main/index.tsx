import React from "react";
import { useRouter } from "expo-router";
import { View, Button } from "react-native";

export default function MainApp() {
    const router = useRouter();

    return (
        <View>
            <Button title="Switch Account" onPress={() => router.push("/accounts/select")} />
        </View>
    );
}
