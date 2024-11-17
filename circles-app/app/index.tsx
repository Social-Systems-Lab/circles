// index.tsx
import React, { useState, useRef } from "react";
import { Text, View, TextInput, ActivityIndicator, TouchableOpacity, Image, Modal, StyleSheet } from "react-native";
import { useAuth } from "../components/auth/AuthContext";
import { WebView } from "react-native-webview";
import Checkbox from "expo-checkbox";
import Constants from "expo-constants";

export default function Index() {
    const { currentAccount, accounts, createAccount, signRequest, login, switchAccount, logout, loading } = useAuth();
    const [name, setName] = useState("");
    const [url, setUrl] = useState("http://192.168.10.204:3000");
    const [inputUrl, setInputUrl] = useState(url);
    const [webViewUrl, setWebViewUrl] = useState(url);
    const [modalVisible, setModalVisible] = useState(false);
    const [permissionsModalVisible, setPermissionsModalVisible] = useState(false);
    const [requestedPermissions, setRequestedPermissions] = useState([]);
    const [grantedPermissions, setGrantedPermissions] = useState<string[]>([]);
    const [switchAccountModalVisible, setSwitchAccountModalVisible] = useState(false);
    const [challengeToSign, setChallengeToSign] = useState<string | undefined>(undefined);
    const webViewRef = useRef(null);

    const handleCreateAccount = async () => {
        await createAccount(name);
    };

    const handleWebViewMessage = async (event) => {
        try {
            const data = JSON.parse(event.nativeEvent.data);
            console.log("Message from WebView:", data);

            if (data.type === "SignChallenge") {
                const { challenge, permissions } = data;
                // Present permissions to the user
                setRequestedPermissions(permissions || []);
                setChallengeToSign(challenge);
                setPermissionsModalVisible(true);
            }
        } catch (error) {
            console.error("Error parsing message from WebView:", error);
        }
    };

    const handleSwitchAccount = async (accountId: string) => {
        await switchAccount(accountId);
        setSwitchAccountModalVisible(false);
    };

    const handlePermissionsSubmit = async () => {
        setPermissionsModalVisible(false);
        if (!currentAccount || !challengeToSign) return;

        const signature = await signRequest(challengeToSign);

        const userData = {
            id: currentAccount.did,
            name: grantedPermissions.includes("name") ? currentAccount.name : undefined,
            publicKey: currentAccount.publicKey,
        };

        let payload = {
            signature,
            userData,
        };

        // send the signed challenge and user data back to the web app
        const jsCode = `
            (function() {
                if (window.onSignedChallengeReceived) {
                    window.onSignedChallengeReceived(${JSON.stringify(payload)});
                }
            })();
            true;
        `;

        if (webViewRef.current && webViewRef.current.injectJavaScript) {
            webViewRef.current.injectJavaScript(jsCode);
        }

        // Reset state
        setGrantedPermissions([]);
        setChallengeToSign(undefined);
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
                            onPress={async () => {
                                await logout();
                                setModalVisible(false);
                            }}
                        >
                            <Text style={styles.modalButtonText}>Logout</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.modalButton}
                            onPress={() => {
                                setSwitchAccountModalVisible(true);
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

            {/* Modal for switching accounts */}
            <Modal
                animationType="slide"
                transparent={true}
                visible={switchAccountModalVisible}
                onRequestClose={() => {
                    setSwitchAccountModalVisible(false);
                }}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={{ fontSize: 18, fontWeight: "bold", marginBottom: 10 }}>Switch Account</Text>
                        {accounts.map((account) => (
                            <TouchableOpacity key={account.did} style={styles.modalButton} onPress={() => handleSwitchAccount(account.did)}>
                                <Text style={styles.modalButtonText}>{account.name}</Text>
                            </TouchableOpacity>
                        ))}
                        <TouchableOpacity
                            style={[styles.modalButton, styles.cancelButton]}
                            onPress={() => {
                                setSwitchAccountModalVisible(false);
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
