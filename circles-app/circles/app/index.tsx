import React, { useState } from "react";
import { Text, View, Button, TextInput, ActivityIndicator, TouchableOpacity, Image, Modal, StyleSheet } from "react-native";
import { useAuth } from "../components/auth/AuthContext";
import { WebView } from "react-native-webview";

export default function Index() {
    const { currentAccount, login, loading, logout } = useAuth();
    const [name, setName] = useState("");
    const [url, setUrl] = useState("http://192.168.10.204:3000");
    const [webViewUrl, setWebViewUrl] = useState(url);
    const [modalVisible, setModalVisible] = useState(false);

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
            <View style={styles.centeredView}>
                <Text>Create an Account</Text>
                <TextInput placeholder="Enter your name" value={name} onChangeText={setName} style={styles.textInput} />
                <Button title="Create Account" onPress={handleCreateAccount} />
                {loading && <ActivityIndicator />}
            </View>
        );
    }

    return (
        <View style={{ flex: 1 }}>
            {/* Header with URL address bar and profile icon */}
            <View style={styles.header}>
                <TextInput
                    style={styles.urlInput}
                    value={url}
                    onChangeText={setUrl}
                    onSubmitEditing={() => {
                        // Navigate to the new URL when the user presses enter
                        setWebViewUrl(url);
                    }}
                />
                <TouchableOpacity
                    onPress={() => {
                        // Show logout/switch account options
                        setModalVisible(true);
                    }}
                >
                    <Image
                        source={require("../assets/images/profile.png")} // Replace with your own image path
                        style={styles.profileIcon}
                    />
                </TouchableOpacity>
            </View>
            {/* WebView */}
            <WebView
                source={{ uri: webViewUrl }}
                style={{ flex: 1 }}
                injectedJavaScript={getInjectedJavaScript()}
                onMessage={(event) => {
                    console.log("Message from WebView:", event.nativeEvent.data);
                }}
                onNavigationStateChange={(navState) => {
                    setUrl(navState.url);
                }}
            />

            {/* Modal for logout / switch account */}
            <Modal
                animationType="slide"
                transparent={true}
                visible={modalVisible}
                onRequestClose={() => {
                    setModalVisible(false);
                }}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <TouchableOpacity
                            style={styles.modalButton}
                            onPress={() => {
                                logout();
                                setModalVisible(false);
                            }}
                        >
                            <Text style={styles.modalButtonText}>Logout</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.modalButton}
                            onPress={() => {
                                // Handle switch account (to be implemented)
                                setModalVisible(false);
                            }}
                        >
                            <Text style={styles.modalButtonText}>Switch Account</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.modalButton, styles.cancelButton]}
                            onPress={() => {
                                setModalVisible(false);
                            }}
                        >
                            <Text style={styles.modalButtonText}>Cancel</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    centeredView: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
    },

    textInput: {
        borderWidth: 1,
        padding: 8,
        width: "80%",
        marginVertical: 8,
    },

    header: {
        flexDirection: "row",
        padding: 8,
        alignItems: "center",
        backgroundColor: "#f2f2f2", // Optional: to make the header stand out
    },

    urlInput: {
        flex: 1,
        borderWidth: 1,
        borderColor: "#ccc",
        padding: 8,
        borderRadius: 4,
        backgroundColor: "#fff",
    },

    profileIcon: {
        width: 32,
        height: 32,
        marginLeft: 8,
        borderRadius: 16,
    },

    modalOverlay: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
    },

    modalContent: {
        backgroundColor: "white",
        padding: 20,
        borderRadius: 10,
        width: "80%",
    },

    modalButton: {
        paddingVertical: 10,
    },

    modalButtonText: {
        fontSize: 18,
        textAlign: "center",
    },

    cancelButton: {
        borderTopWidth: 1,
        borderColor: "#ccc",
        marginTop: 10,
    },
});
