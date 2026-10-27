export const CHAT_ATTACHMENT_MAX_COUNT = 10;
export const CHAT_ATTACHMENT_MAX_FILE_SIZE = 5 * 1024 * 1024;
export const CHAT_ATTACHMENT_MAX_TOTAL_SIZE = 25 * 1024 * 1024;

export type QueuedChatAttachment = {
    id: string;
    file: File;
    previewUrl?: string;
};

export type QueueFilesResult = {
    accepted: File[];
    error?: string;
};

export const validateFilesForQueue = (currentFiles: File[], selectedFiles: File[]): QueueFilesResult => {
    if (currentFiles.length + selectedFiles.length > CHAT_ATTACHMENT_MAX_COUNT) {
        return { accepted: [], error: "A message can include at most 10 attachments." };
    }
    if (selectedFiles.some((file) => file.size > CHAT_ATTACHMENT_MAX_FILE_SIZE)) {
        return { accepted: [], error: "Each attachment must be 5MB or smaller." };
    }
    const totalSize = [...currentFiles, ...selectedFiles].reduce((total, file) => total + file.size, 0);
    if (totalSize > CHAT_ATTACHMENT_MAX_TOTAL_SIZE) {
        return { accepted: [], error: "Combined attachment size must be 25MB or smaller." };
    }
    return { accepted: selectedFiles };
};

export const removeQueuedAttachment = (
    attachments: QueuedChatAttachment[],
    attachmentId: string,
): { attachments: QueuedChatAttachment[]; removed?: QueuedChatAttachment } => ({
    attachments: attachments.filter((attachment) => attachment.id !== attachmentId),
    removed: attachments.find((attachment) => attachment.id === attachmentId),
});

export const buildComposerScopeKey = (conversationId: string, topicId?: string): string =>
    topicId ? `${conversationId}:topic:${topicId}` : `${conversationId}:conversation`;

export const getStableSubmissionId = (
    current: { signature: string; submissionId: string } | null,
    signature: string,
    createId: () => string,
): { signature: string; submissionId: string } =>
    current?.signature === signature ? current : { signature, submissionId: createId() };

export const buildComposedMessageSignature = ({
    scopeKey,
    body,
    replyToMessageId,
    attachments,
}: {
    scopeKey: string;
    body: string;
    replyToMessageId?: string;
    attachments: QueuedChatAttachment[];
}): string =>
    JSON.stringify({
        scopeKey,
        body,
        replyToMessageId: replyToMessageId || null,
        attachments: attachments.map(({ id, file }) => ({ id, name: file.name, size: file.size, type: file.type })),
    });

export const buildComposedMessageFormData = ({
    conversationId,
    topicId,
    body,
    replyToMessageId,
    submissionId,
    attachments,
}: {
    conversationId: string;
    topicId?: string;
    body: string;
    replyToMessageId?: string;
    submissionId: string;
    attachments: QueuedChatAttachment[];
}): FormData => {
    const formData = new FormData();
    formData.set("roomId", conversationId);
    if (topicId) formData.set("threadId", topicId);
    formData.set("body", body);
    formData.set("submissionId", submissionId);
    if (replyToMessageId) formData.set("replyToMessageId", replyToMessageId);
    for (const attachment of attachments) formData.append("files", attachment.file);
    return formData;
};
