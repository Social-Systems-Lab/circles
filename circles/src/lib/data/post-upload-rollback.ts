export type UploadedFileForRollback = {
    url: string;
};

export type RollbackCleanupResult = {
    deletedUrls: string[];
    failedDeletes: Array<{ url: string; error: unknown }>;
};

export const cleanupUploadedFiles = async (
    uploadedFiles: UploadedFileForRollback[],
    deleteFileByUrl: (url: string) => Promise<void>,
): Promise<RollbackCleanupResult> => {
    const result: RollbackCleanupResult = {
        deletedUrls: [],
        failedDeletes: [],
    };

    for (const file of uploadedFiles) {
        try {
            await deleteFileByUrl(file.url);
            result.deletedUrls.push(file.url);
        } catch (error) {
            result.failedDeletes.push({ url: file.url, error });
        }
    }

    return result;
};
