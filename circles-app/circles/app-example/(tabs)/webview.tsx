import { StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";

export default function WebviewScreen() {
    return (
        <View style={styles.container}>
            <WebView
                source={{ uri: "http://192.168.10.204:3000" }} // Change to your desired URL
                style={styles.webview}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    webview: {
        flex: 1,
    },
});
