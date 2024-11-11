import React, { useState } from "react";
import { Text, View, Button, TextInput, ActivityIndicator } from "react-native";
import { useAuth } from "../components/auth/AuthContext";
import { WebView } from "react-native-webview";

export default function Index() {
    const { currentAccount, login, loading } = useAuth();
    const [name, setName] = useState("");

    const handleCreateAccount = async () => {
        await login(name);
    };

    // Function to inject user data into the WebView as soon as it loads
    const getInjectedJavaScript = () => {
        if (currentAccount) {
            const accountData = JSON.stringify(currentAccount);
            return `
                (function() {
                    window.CIRCLES_USER_DATA = ${accountData};
                    if (window.onUserDataReceived) {
                        window.onUserDataReceived(window.CIRCLES_USER_DATA);
                    }
                })();
                true; // note: required for Android
            `;
        }
        return "";
    };

    if (!currentAccount) {
        return (
            <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
                <Text>Create an Account</Text>
                <TextInput
                    placeholder="Enter your name"
                    value={name}
                    onChangeText={setName}
                    style={{ borderWidth: 1, padding: 8, width: "80%", marginVertical: 8 }}
                />
                <Button title="Create Account 2" onPress={handleCreateAccount} />
                {loading && <ActivityIndicator />}
            </View>
        );
    }

    return (
        <View style={{ flex: 1, height: 1000, backgroundColor: "#040493" }}>
            <WebView
                source={{ uri: "http://192.168.10.204:3000" }} // URL points to our nextjs app running on the local network
                style={{ flex: 1, height: 1000, backgroundColor: "#040493" }}
                injectedJavaScript={getInjectedJavaScript()}
                onMessage={(event) => {
                    console.log("Message from WebView:", event.nativeEvent.data);
                }}
            />
        </View>
    );
}
