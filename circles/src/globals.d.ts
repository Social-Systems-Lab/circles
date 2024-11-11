declare global {
    interface Window {
        CIRCLES_USER_DATA?: string; // Specify type as string or any appropriate type
        onUserDataReceived?: (data: string) => void;
    }
}
