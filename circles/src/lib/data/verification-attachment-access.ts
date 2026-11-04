import type { VerificationRequest } from "@/models/models";
import type { FileInfo } from "@/models/models";

export const canReadVerificationAttachment = (
    viewerDid: string,
    viewerIsAdmin: boolean,
    request: Pick<VerificationRequest, "userDid">,
): boolean => viewerIsAdmin || request.userDid === viewerDid;

export const getVerificationAttachmentAccess = (
    viewerDid: string | undefined,
    viewerIsAdmin: boolean,
    request: Pick<VerificationRequest, "userDid">,
): "allowed" | "forbidden" | "not_found" => {
    if (!viewerDid) return "not_found";
    return canReadVerificationAttachment(viewerDid, viewerIsAdmin, request) ? "allowed" : "forbidden";
};

export const verificationAttachmentUrl = (messageId: string, attachmentIndex: number): string =>
    `/verification-attachments/${encodeURIComponent(messageId)}/${attachmentIndex}`;

export const verificationAttachmentDisplayName = (originalName?: string): string => {
    const baseName = (originalName ?? "").split(/[\\/]/).at(-1) ?? "";
    return (
        baseName
            .replace(/[\u0000-\u001f\u007f]/g, "")
            .trim()
            .slice(0, 255) || "attachment"
    );
};

export const serializeVerificationAttachment = (file: FileInfo, messageId: string, attachmentIndex: number) => ({
    url: verificationAttachmentUrl(messageId, attachmentIndex),
    originalName: verificationAttachmentDisplayName(file.originalName),
});
