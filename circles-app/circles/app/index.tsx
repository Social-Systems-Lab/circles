import React, { useState, useRef } from "react";
import { Text, View, TextInput, ActivityIndicator, TouchableOpacity, Image, Modal, StyleSheet } from "react-native";
import { useAuth } from "../components/auth/AuthContext";
import { WebView } from "react-native-webview";
import Checkbox from "expo-checkbox";
import Constants from "expo-constants";

export default function Index() {
    const { currentAccount, login, loading, logout } = useAuth();
    const [name, setName] = useState("");
    const [url, setUrl] = useState("http://192.168.10.204:3000");
    const [inputUrl, setInputUrl] = useState(url);
    const [webViewUrl, setWebViewUrl] = useState(url);
    const [modalVisible, setModalVisible] = useState(false);
    const [permissionsModalVisible, setPermissionsModalVisible] = useState(false);
    const [requestedPermissions, setRequestedPermissions] = useState([]);
    const [grantedPermissions, setGrantedPermissions] = useState([]);
    const webViewRef = useRef(null);

    const handleCreateAccount = async () => {
        await login(name);
    };

    const handleWebViewMessage = (event) => {
        try {
            const data = JSON.parse(event.nativeEvent.data);
            console.log("Message from WebView:", data);

            if (data.type === "RequestAuthentication") {
                setRequestedPermissions(data.permissions || []);
                setPermissionsModalVisible(true);
            }
        } catch (error) {
            console.error("Error parsing message from WebView:", error);
        }
    };

    const handlePermissionsSubmit = () => {
        setPermissionsModalVisible(false);

        const userData = {
            id: currentAccount.id,
            name: grantedPermissions.includes("name") ? currentAccount.name : undefined,
            publicKey: currentAccount.publicKey,
        };

        const jsCode = `
        (function() {
          if (!window.circlesUserDataSent) {
            window.circlesUserDataSent = true;
            window.CIRCLES_USER_DATA = ${JSON.stringify(userData)};
            if (typeof window.onUserDataReceived === 'function') {
              window.onUserDataReceived(window.CIRCLES_USER_DATA);
            }
          }
        })();
        true;
      `;

        if (webViewRef.current && webViewRef.current.injectJavaScript) {
            webViewRef.current.injectJavaScript(jsCode);
        }

        // Reset granted permissions
        setGrantedPermissions([]);
    };

    if (!currentAccount) {
        return (
            <View style={styles.centeredView}>
                {/* Profile Mock */}
                <Image
                    source={require("../assets/images/profile.png")} // Adjust the path as necessary
                    style={styles.profileIconLarge}
                />
                <Text style={styles.createAccountText}>Create an Account</Text>
                <TextInput placeholder="Enter your name" value={name} onChangeText={setName} style={styles.roundedTextInput} />
                <TouchableOpacity style={styles.roundedButton} onPress={handleCreateAccount}>
                    <Text style={styles.buttonText}>Create Account</Text>
                </TouchableOpacity>
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
                    value={inputUrl}
                    onChangeText={setInputUrl}
                    onSubmitEditing={() => {
                        if (inputUrl !== webViewUrl) {
                            setWebViewUrl(inputUrl);
                        }
                    }}
                />
                <TouchableOpacity
                    onPress={() => {
                        setModalVisible(true);
                    }}
                >
                    <Image
                        source={require("../assets/images/profile.png")} // Replace with your image path
                        style={styles.profileIcon}
                    />
                </TouchableOpacity>
            </View>
            {/* WebView */}
            <WebView
                ref={webViewRef}
                source={{ uri: webViewUrl }}
                style={{ flex: 1 }}
                onMessage={handleWebViewMessage}
                onNavigationStateChange={(navState) => {
                    if (navState.url !== url) {
                        console.log("NavigationStateChange URL:", navState.url);
                        setUrl(navState.url);
                        setInputUrl(navState.url);
                    }
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

            {/* Modal for permissions */}
            <Modal
                animationType="slide"
                transparent={true}
                visible={permissionsModalVisible}
                onRequestClose={() => {
                    setPermissionsModalVisible(false);
                }}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={{ fontSize: 18, fontWeight: "bold", marginBottom: 10 }}>Permissions Request</Text>
                        <Text>The site is requesting access to the following information:</Text>
                        {requestedPermissions.map((permission) => (
                            <View key={permission} style={{ flexDirection: "row", alignItems: "center", marginVertical: 5 }}>
                                <Checkbox
                                    value={grantedPermissions.includes(permission)}
                                    onValueChange={(newValue) => {
                                        if (newValue) {
                                            setGrantedPermissions((prevPermissions) => [...prevPermissions, permission]);
                                        } else {
                                            setGrantedPermissions((prevPermissions) => prevPermissions.filter((p) => p !== permission));
                                        }
                                    }}
                                    color={grantedPermissions.includes(permission) ? "#4630EB" : undefined}
                                />
                                <Text style={{ marginLeft: 8 }}>{permission}</Text>
                            </View>
                        ))}
                        <TouchableOpacity style={styles.roundedButton} onPress={handlePermissionsSubmit}>
                            <Text style={styles.buttonText}>Submit</Text>
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
        paddingTop: Constants.statusBarHeight,
    },
    createAccountText: {
        fontSize: 24,
        fontWeight: "bold",
        marginBottom: 16,
    },
    profileIconLarge: {
        width: 80,
        height: 80,
        marginBottom: 16,
        borderRadius: 40,
    },
    roundedTextInput: {
        borderWidth: 1,
        borderColor: "#ccc",
        padding: 12,
        width: "80%",
        marginVertical: 8,
        borderRadius: 25,
        backgroundColor: "#fff",
    },
    roundedButton: {
        backgroundColor: "#007AFF",
        paddingVertical: 12,
        paddingHorizontal: 32,
        borderRadius: 25,
        marginTop: 16,
        alignItems: "center",
        width: "80%",
    },
    buttonText: {
        color: "#fff",
        fontSize: 16,
        fontWeight: "bold",
    },
    header: {
        flexDirection: "row",
        padding: 8,
        paddingTop: Constants.statusBarHeight + 8,
        alignItems: "center",
        backgroundColor: "#f2f2f2",
    },
    urlInput: {
        flex: 1,
        borderWidth: 1,
        borderColor: "#ccc",
        padding: 8,
        borderRadius: 25,
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
        backgroundColor: "#ffe4fe",
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
