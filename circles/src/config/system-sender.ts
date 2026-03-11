export type SystemSenderIdentity = {
    displayName: string;
    handle: string;
    did: string;
    avatarUrl: string;
};

const KAMOONI_SYSTEM_SENDER: SystemSenderIdentity = {
    displayName: "Kamooni",
    handle: "kamooni",
    did: "system:kamooni",
    avatarUrl: "/images/kamooni_logo.png",
};

export const getKamooniSystemSender = (): SystemSenderIdentity => ({
    ...KAMOONI_SYSTEM_SENDER,
});
