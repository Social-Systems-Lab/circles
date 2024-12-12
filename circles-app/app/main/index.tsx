// index.tsx - Main app component
import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "expo-router";
import { View, Button, TextInput, TouchableOpacity, Image, StyleSheet, Modal, Text } from "react-native";
import WebView, { WebViewMessageEvent } from "react-native-webview";
import { Ionicons } from "@expo/vector-icons";
import { useCameraPermissions } from "expo-camera";
import { useAuth } from "@/components/auth/auth-context";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

const defaultUrl = "http://192.168.10.204:3000/demo/moviedb"; // circles running locally
//const defaultUrl = "https://makecircles.org/feeds"; // circles prod server

interface AppPermissions {
    appId: string;
    name: string;
    description: string;
    permissions: { [key: string]: "always" | "ask" | "never" };
}

export default function MainApp() {
    const router = useRouter();
    const { accounts, currentAccount, initialized } = useAuth();
    const webViewRef = useRef<WebView>(null);
    const [inputUrl, setInputUrl] = useState(defaultUrl);
    const [webViewUrl, setWebViewUrl] = useState(inputUrl);
    const [jsCode, setJsCode] = useState<string | undefined>(undefined);
    const [permission, requestPermission] = useCameraPermissions();

    const [activeManifest, setActiveManifest] = useState<any>(undefined);
    const [modalVisible, setModalVisible] = useState(false);
    const [writeModalVisible, setWriteModalVisible] = useState(false);
    const [permissionsIndicator, setPermissionsIndicator] = useState(false);
    const [acceptedApps, setAcceptedApps] = useState<AppPermissions[]>([]);
    const [writeRequest, setWriteRequest] = useState<any>(null);
    const [showJson, setShowJson] = useState<boolean>(false);

    useEffect(() => {
        if (!initialized) return;

        let ssiAccountData = { did: currentAccount?.did, name: currentAccount?.name, publicKey: currentAccount?.publicKey };
        console.log("Injecting accounts data", ssiAccountData);

        const jsCode = `
        (function() {
            window._SSI_ACCOUNT = ${JSON.stringify(ssiAccountData)};
            window.requestAccess = function(manifest) {
                window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ManifestRequest', manifest }));
            };            
        })();
        `;
        setJsCode(jsCode);
    }, [initialized]);

    const handleWebViewMessage = async (event: WebViewMessageEvent) => {
        try {
            const data = JSON.parse(event.nativeEvent.data);
            if (data.type === "Log") {
                console.log("[WebView]:", data.message);
            } else if (data.type === "ManifestRequest") {
                const appId = data.manifest.id;
                const existingApp = acceptedApps.find((app) => app.appId === appId);

                if (existingApp) {
                    console.log(`App ${existingApp.name} already accepted with permissions:`, existingApp.permissions);
                    setPermissionsIndicator(false);
                } else {
                    const permissionsState = Object.fromEntries(
                        data.manifest.permissions.map((perm: string) => [perm, perm.startsWith("Read") ? "always" : "ask"])
                    );

                    setActiveManifest({
                        ...data.manifest,
                        permissionsState,
                    });
                    setPermissionsIndicator(true);
                }
            } else if (data.type === "WriteRequest") {
                console.log("Write request received:", data.data);
                const permission = activeManifest?.permissionsState["Write Ratings"];
                // if (permission === "ask") {
                setWriteRequest(data.data);
                setWriteModalVisible(true);
                // } else if (permission === "always") {
                //     console.log("Permission already granted, writing data:", data.data);
                //     // Logic to write data can go here
                // }
            }
        } catch (error) {
            console.error("Error parsing message from WebView:", error);
        }
    };

    const scanQRCode = async () => {
        if (!permission?.granted) {
            console.log("Requesting camera permission");
            let res = await requestPermission();
            if (!res.granted) {
                console.log("Camera permission denied");
                return;
            }
        }
        // open QR scanner
        router.push("/main/qr-scanner");
    };

    const handleAccept = (permissions: { [key: string]: "always" | "ask" | "never" }) => {
        console.log("Access accepted for:", activeManifest);
        setAcceptedApps((prev) => [
            ...prev,
            {
                appId: activeManifest.id,
                name: activeManifest.name,
                description: activeManifest.description,
                permissions,
            },
        ]);
        setModalVisible(false);
        setPermissionsIndicator(false);
    };

    const handleReject = () => {
        console.log("Access rejected for:", activeManifest);
        setModalVisible(false);
        setPermissionsIndicator(false);
        setActiveManifest(null);
    };

    const handlePermissionChange = (permission: string, level: "always" | "ask" | "never") => {
        setActiveManifest((prev: any) => {
            if (!prev) return prev;

            const updatedPermissionsState = {
                ...prev.permissionsState,
                [permission]: level,
            };

            return {
                ...prev,
                permissionsState: updatedPermissionsState,
            };
        });
    };

    return (
        <View style={{ flex: 1 }}>
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
                    placeholder="Enter URL"
                    keyboardType="url"
                    autoCapitalize="none"
                />
                <TouchableOpacity onPress={scanQRCode}>
                    <View style={styles.qrCodeIcon}>
                        <View style={{ justifyContent: "center", alignItems: "center", width: 20, height: 20 }}>
                            <MaterialCommunityIcons name="qrcode-scan" size={20} color="black" />
                        </View>
                    </View>
                </TouchableOpacity>

                <TouchableOpacity
                    onPress={() => {
                        router.push("/accounts/account-select");
                    }}
                >
                    <Image source={require("../../assets/images/picture3.jpg")} style={styles.profileIcon} />
                </TouchableOpacity>
            </View>

            {permissionsIndicator && (
                <TouchableOpacity style={styles.permissionsIndicator} onPress={() => setModalVisible(true)}>
                    <Image source={{ uri: activeManifest?.pictureUrl }} style={styles.permissionsIndicatorIcon} />
                    <View style={{ flex: 1, flexDirection: "column" }}>
                        <Text style={styles.permissionsIndicatorHeader}>{activeManifest?.name}</Text>
                        <Text style={styles.permissionsIndicatorText}>wants access to your data</Text>
                    </View>
                </TouchableOpacity>
            )}

            {jsCode && (
                <WebView
                    ref={webViewRef}
                    source={{ uri: webViewUrl }}
                    style={{ flex: 1 }}
                    onMessage={handleWebViewMessage}
                    injectedJavaScript={jsCode}
                    javaScriptEnabled
                />
            )}

            <Modal visible={modalVisible} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalCard}>
                        {/* App Info */}
                        <View style={styles.modalHeader}>
                            {activeManifest?.pictureUrl && <Image source={{ uri: activeManifest.pictureUrl }} style={styles.appIcon} />}
                            <Text style={styles.appName}>{activeManifest?.name}</Text>
                        </View>

                        {/* App Description */}
                        <Text style={styles.appDescription}>{activeManifest?.description}</Text>

                        {/* Requested Permissions */}
                        <View style={styles.permissionsList}>
                            <Text style={styles.permissionsHeader}>{activeManifest?.name} would like to:</Text>
                            {Object.entries(activeManifest?.permissionsState || {}).map(([perm, level]) => (
                                <View key={perm} style={styles.permissionItem}>
                                    <Text style={styles.permissionText}>{perm}</Text>
                                    <View style={styles.permissionOptions}>
                                        <TouchableOpacity
                                            style={[styles.permissionButton, level === "always" && styles.permissionButtonSelected]}
                                            onPress={() => handlePermissionChange(perm, "always")}
                                        >
                                            <Text style={level === "always" ? styles.permissionButtonSelectedText : styles.permissionButtonText}>Always</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={[styles.permissionButton, level === "ask" && styles.permissionButtonSelected]}
                                            onPress={() => handlePermissionChange(perm, "ask")}
                                        >
                                            <Text style={level === "ask" ? styles.permissionButtonSelectedText : styles.permissionButtonText}>Ask</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={[styles.permissionButton, level === "never" && styles.permissionButtonSelected]}
                                            onPress={() => handlePermissionChange(perm, "never")}
                                        >
                                            <Text style={level === "never" ? styles.permissionButtonSelectedText : styles.permissionButtonText}>Never</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            ))}
                        </View>

                        {/* Action Buttons */}
                        <View style={styles.actionButtons}>
                            <TouchableOpacity style={[styles.actionButton, styles.cancelButton]} onPress={handleReject}>
                                <Text style={styles.actionButtonText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.actionButton, styles.allowButton]}
                                onPress={() => handleAccept(Object.fromEntries(activeManifest.permissions.map((perm: string) => [perm, "always"])))}
                            >
                                <Text style={styles.actionButtonText}>Allow Access</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            <Modal visible={writeModalVisible} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalCard}>
                        <View style={styles.modalHeader}>
                            {activeManifest?.pictureUrl && <Image source={{ uri: activeManifest.pictureUrl }} style={styles.appIcon} />}
                            <Text style={styles.appName}>{activeManifest?.name}</Text>
                        </View>
                        <Text style={styles.appDescription}>This website wants to {writeRequest?.action.toLowerCase()} the following data:</Text>
                        <TouchableOpacity onPress={() => setShowJson(!showJson)}>
                            <Text style={styles.viewJsonButton}>{showJson ? "Hide JSON Object" : "View JSON Object"}</Text>
                        </TouchableOpacity>
                        {showJson && <Text style={styles.jsonText}>{JSON.stringify(writeRequest?.object, null, 2)}</Text>}
                        <View style={styles.actionButtons}>
                            <TouchableOpacity style={[styles.actionButton, styles.cancelButton]} onPress={() => setWriteModalVisible(false)}>
                                <Text style={styles.actionButtonText}>Reject</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.actionButton, styles.allowButton]}
                                onPress={() => {
                                    console.log("Write request accepted:", writeRequest);
                                    setWriteModalVisible(false);
                                }}
                            >
                                <Text style={styles.actionButtonText}>Accept</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    header: {
        height: 50,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 10,
        backgroundColor: "#ffffff",
    },
    urlInput: {
        flex: 1,
        height: 40,
        marginRight: 10,
        paddingHorizontal: 14,
        borderRadius: 38,
        backgroundColor: "#f3f4f6",
        borderWidth: 0,
        borderColor: "transparent",
    },
    profileIcon: {
        width: 36,
        height: 36,
        borderRadius: 26,
    },
    qrCodeIcon: {
        width: 36,
        height: 36,
        borderRadius: 26,
        marginRight: 10,
        backgroundColor: "#f1f1f1",
        justifyContent: "center",
        alignItems: "center",
    },
    permissionsIndicator: {
        position: "absolute",
        top: 60, // Positioned below the address bar
        left: "5%",
        right: "5%",
        backgroundColor: "#fffcda", // Light yellow background
        flexDirection: "row",
        alignItems: "center",
        padding: 10,
        borderRadius: 45, // Fully rounded corners
        shadowColor: "#000",
        shadowOpacity: 0.1,
        shadowOffset: { width: 0, height: 2 },
        shadowRadius: 4,
        elevation: 4, // For Android shadow
        zIndex: 10, // Ensure it hovers over the WebView
    },
    permissionsIndicatorIcon: {
        width: 30,
        height: 30,
        borderRadius: 15, // Circular icon
        marginRight: 10,
    },
    permissionsIndicatorHeader: {
        fontSize: 12,
        color: "#333",
        fontWeight: "700",
    },

    permissionsIndicatorText: {
        fontSize: 12,
        color: "#333",
        fontWeight: "400",
    },

    modalOverlay: {
        flex: 1,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        justifyContent: "center",
        alignItems: "center",
    },
    modalCard: {
        width: "90%",
        backgroundColor: "#fff",
        borderRadius: 10,
        padding: 20,
        shadowColor: "#000",
        shadowOpacity: 0.1,
        shadowOffset: { width: 0, height: 2 },
        shadowRadius: 8,
        elevation: 5,
    },
    modalHeader: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 20,
    },
    appIcon: {
        width: 50,
        height: 50,
        borderRadius: 8,
        marginRight: 10,
    },
    appName: {
        fontSize: 18,
        fontWeight: "bold",
        color: "#333",
    },
    appDescription: {
        fontSize: 14,
        color: "#666",
        marginBottom: 20,
    },
    permissionsList: {
        marginBottom: 20,
    },
    permissionsHeader: {
        fontSize: 16,
        fontWeight: "bold",
        marginBottom: 10,
    },
    permissionItem: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 10,
    },
    permissionText: {
        fontSize: 14,
        color: "#333",
    },
    permissionOptions: {
        flexDirection: "row",
        gap: 10,
    },
    permissionButton: {
        backgroundColor: "#f0f0f0",
        paddingVertical: 5,
        paddingHorizontal: 10,
        borderRadius: 5,
        borderWidth: 1,
        borderColor: "#ccc",
    },
    permissionButtonSelected: {
        backgroundColor: "#007bff",
        borderColor: "#0056b3",
    },
    permissionButtonText: {
        fontSize: 12,
        color: "#333",
    },
    permissionButtonSelectedText: {
        fontSize: 12,
        color: "#fff",
        fontWeight: "bold",
    },
    viewJsonButton: {
        color: "#007bff",
        marginBottom: 10,
    },
    jsonText: {
        fontFamily: "monospace",
        backgroundColor: "#f8f9fa",
        padding: 10,
        borderRadius: 5,
        marginBottom: 10,
    },
    actionButtons: {
        flexDirection: "row",
        justifyContent: "space-between",
    },
    actionButton: {
        paddingVertical: 10,
        paddingHorizontal: 20,
        borderRadius: 5,
    },
    cancelButton: {
        backgroundColor: "#e0e0e0",
    },
    allowButton: {
        backgroundColor: "#007bff",
    },
    actionButtonText: {
        fontSize: 14,
        color: "#fff",
        fontWeight: "bold",
    },
    closeButton: {
        position: "absolute",
        top: 10,
        right: 10,
    },
});
