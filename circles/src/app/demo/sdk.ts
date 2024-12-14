// sdk.ts - Vibe SSI app framework SDK
declare global {
    interface Window {
        _VIBE_ENABLED?: boolean;
        ReactNativeWebView?: {
            postMessage: (message: string) => void;
        };
        vibe?: typeof vibe;
    }
}

export type Account = {
    did: string;
    publicKey: string;
    name: string;
};

export type VibeState = {
    account: Account | null;
    permissions: Record<string, "always" | "ask" | "never">;
};

export type AppManifest = {
    id: string;
    name: string;
    description: string;
    permissions: string[];
    pictureUrl?: string;
};

export type Callback = (state: VibeState) => void;
export type Unsubscribe = () => void;

export enum MessageType {
    INIT_REQUEST = "InitRequest",
    WRITE_REQUEST = "WriteRequest",
    NATIVE_RESPONSE = "NativeResponse",
    LOG_REQUEST = "LogRequest",
}

const vibe = (() => {
    let _state: VibeState = { account: null, permissions: {} }; // Initial state
    let _listeners: Callback[] = []; // State listeners
    const pendingRequests: Record<string, (value: any) => void> = {}; // Tracks requests

    const generateRequestId = () => Date.now().toString();

    const enabled = () => !!window._VIBE_ENABLED;
    const initialized = false; // TODO true when vibe is enabled and vibe.init is called and app has been granted permissions

    const init = (manifest: AppManifest, callback: Callback): Unsubscribe => {
        if (!enabled) {
            // TODO perhaps call callback with information that vibe is not enabled
            return () => {};
        }

        sendToNativeApp({
            type: MessageType.LOG_REQUEST,
            message: "Initializing vibe with manifest. " + JSON.stringify(manifest),
        });
        //console.log("Initializing vibe with manifest", manifest);

        _listeners.push(callback);
        sendToNativeApp({
            type: MessageType.INIT_REQUEST,
            manifest,
        });
        callback(_state);

        return () => {
            _listeners = _listeners.filter((listener) => listener !== callback);
        };
    };

    const writeData = (data: any): Promise<any> => {
        if (!enabled) {
            return Promise.reject(
                new Error(
                    "writeData called when vibe is not enabled. Make sure to check vibe.enabled and call vibe.init to initialize the app",
                ),
            );
        }

        return sendAsyncToNativeApp({
            type: MessageType.WRITE_REQUEST,
            data,
        });
    };

    const sendToNativeApp = (message: any) => {
        if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify(message));
        } else {
            console.error("ReactNativeWebView not available");
        }
    };

    const sendAsyncToNativeApp = (message: any): Promise<any> => {
        return new Promise((resolve, reject) => {
            const requestId = generateRequestId();
            pendingRequests[requestId] = resolve;
            sendToNativeApp({ ...message, requestId });

            // timeout to reject the promise if no response
            setTimeout(() => {
                if (pendingRequests[requestId]) {
                    delete pendingRequests[requestId];
                    reject(new Error("Request timed out"));
                }
            }, 60000); // 60 seconds
        });
    };

    const handleNativeResponse = (response: any) => {
        sendToNativeApp({
            type: MessageType.LOG_REQUEST,
            message: "Got response from native app" + JSON.stringify(response),
        });
        const { requestId, result, error, stateUpdate } = response;
        if (stateUpdate) {
            _state = { ..._state, ...stateUpdate };
            _listeners.forEach((listener) => listener(_state));
        }
        if (requestId && pendingRequests[requestId]) {
            if (error) {
                pendingRequests[requestId](Promise.reject(new Error(error)));
            } else {
                pendingRequests[requestId](result);
            }
            delete pendingRequests[requestId];
        }
    };

    return {
        enabled,
        init,
        writeData,
        _state,
        _listeners,
        handleNativeResponse,
    };
})();

if (typeof window !== "undefined") {
    (window as any).vibe = vibe;
}

export { vibe };
