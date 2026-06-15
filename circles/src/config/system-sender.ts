export type SystemSenderIdentity = {
    displayName: string;
    handle: string;
    did: string;
    avatarUrl: string;
};

const KAMOONI_SYSTEM_SENDER: SystemSenderIdentity = {
    displayName: "Peerify",
    handle: "kamooni",
    did: "system:kamooni",
    avatarUrl: "/peerify/logo-mark.png",
};

export const getKamooniSystemSender = (): SystemSenderIdentity => ({
    ...KAMOONI_SYSTEM_SENDER,
});
