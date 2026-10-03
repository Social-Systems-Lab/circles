// file storage

import fs from "fs-extra";
import path from "path";
import { randomUUID } from "crypto";
import { Client as MinioClient } from "minio";

const resolveMinioHost = () => {
    const configuredHost = process.env.MINIO_HOST || "127.0.0.1";
    if (process.env.NODE_ENV !== "production" && (configuredHost === "db" || configuredHost === "minio")) {
        return "127.0.0.1";
    }
    return configuredHost;
};

const resolveFileExtension = (originalName?: string, mimeType?: string) => {
    const extFromName = originalName ? path.extname(originalName).toLowerCase() : "";
    if (extFromName) {
        return extFromName;
    }
    const mimeMap: Record<string, string> = {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
        "image/gif": ".gif",
        "application/pdf": ".pdf",
    };
    return mimeType ? mimeMap[mimeType] || "" : "";
};

const minioClient = new MinioClient({
    endPoint: resolveMinioHost(),
    port: parseInt(process.env.MINIO_PORT || "9000"),
    useSSL: false,
    accessKey: process.env.MINIO_ROOT_USERNAME || "minioadmin",
    secretKey: process.env.MINIO_ROOT_PASSWORD || "minioadmin",
});

const bucketName = "circles";
export const verificationBucketName = process.env.MINIO_VERIFICATION_BUCKET || "circles-verification";
export const VERIFICATION_STORAGE_SCHEME = "verification-private://";

export const isFile = (file: any) => {
    return file && typeof file === "object" && file.type && file.size;
};

export const listBuckets = async () => {
    return minioClient.listBuckets();
};

const ensureBucketExists = async () => {
    const exists = await minioClient.bucketExists(bucketName);
    if (!exists) {
        await minioClient.makeBucket(bucketName);
        const policy = {
            Version: "2012-10-17",
            Statement: [
                {
                    Effect: "Allow",
                    Principal: "*",
                    Action: ["s3:GetObject"],
                    Resource: [`arn:aws:s3:::${bucketName}/*`],
                },
            ],
        };
        await minioClient.setBucketPolicy(bucketName, JSON.stringify(policy));
    }
};

const ensureVerificationBucketExists = async () => {
    const exists = await minioClient.bucketExists(verificationBucketName);
    if (!exists) {
        await minioClient.makeBucket(verificationBucketName);
    }
    try {
        await minioClient.setBucketPolicy(verificationBucketName, "");
    } catch (error: any) {
        if (error?.code !== "NoSuchBucketPolicy" && error?.code !== "NoSuchPolicy") throw error;
    }
};

const checkIfFileExists = async (circleId: string, fileName: string): Promise<boolean> => {
    try {
        const objectName = `${circleId}/${fileName}`;
        await minioClient.statObject(bucketName, objectName);
    } catch (error) {
        return false;
    }
    return true;
};

export type FileInfo = {
    originalName: string;
    fileName: string;
    url: string;
};

export const saveFile = async (
    file: any,
    fileName: string,
    circleId: string,
    overwrite: boolean,
): Promise<FileInfo> => {
    // --- Local filesystem override for development ---
    if (process.env.LOCAL_FS_STORAGE === "true" && process.env.NODE_ENV !== "production") {
        const uploadDir = path.join(process.cwd(), "public", "uploads");
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }

        // Convert file → Buffer
        let buffer: Buffer;
        if (file instanceof Buffer) {
            buffer = file;
        } else if (typeof file.arrayBuffer === "function") {
            buffer = Buffer.from(await file.arrayBuffer());
        } else if (typeof file === "string" && file.startsWith("data:")) {
            const matches = file.match(/^data:(.+);base64,(.+)$/);
            buffer = Buffer.from(matches?.[2] ?? "", "base64");
        } else {
            buffer = Buffer.from(file);
        }

        const originalName = typeof file?.name === "string" ? file.name : fileName;
        const extension = resolveFileExtension(originalName, file?.type);
        const finalName = `${Date.now()}-${fileName}${extension}`;
        const filePath = path.join(uploadDir, finalName);

        const fileDir = path.dirname(filePath);
        if (!fs.existsSync(fileDir)) {
            fs.mkdirSync(fileDir, { recursive: true });
        }

        fs.writeFileSync(filePath, buffer);

        return {
            originalName,
            fileName: finalName,
            url: `/uploads/${finalName}`,
        };
    }
    // --- End local override ---

    await ensureBucketExists();
    if (!overwrite) {
        let fileExists = await checkIfFileExists(circleId, fileName);
        if (fileExists) {
            throw new Error("File already exists");
        }
    }

    const objectBaseName = `${fileName}${Date.now()}`;
    let buffer: Buffer;
    let contentType = "application/octet-stream";
    let originalName = "unknown";

    try {
        console.log("saveFile: file type is", typeof file, file?.constructor?.name);

        // Handle different types of file objects
        if (file instanceof Buffer) {
            // Already a buffer
            buffer = file;
            console.log("saveFile: file is a Buffer");
        } else if (typeof file.arrayBuffer === "function") {
            // Browser File or Blob
            buffer = Buffer.from(await file.arrayBuffer());
            contentType = file.type || contentType;
            originalName = file.name || originalName;
            console.log("saveFile: file has arrayBuffer method");
        } else if (typeof file === "string" && file.startsWith("data:")) {
            // Data URL
            const matches = file.match(/^data:(.+);base64,(.+)$/);
            if (matches && matches.length === 3) {
                contentType = matches[1];
                buffer = Buffer.from(matches[2], "base64");
                console.log("saveFile: file is a data URL");
            } else {
                throw new Error("Invalid data URL format");
            }
        } else if (Buffer.isBuffer(file)) {
            // Node.js Buffer
            buffer = file;
            console.log("saveFile: file is a Node.js Buffer");
        } else {
            // Try to convert to buffer as a last resort
            console.log("saveFile: trying to convert to buffer as last resort");
            buffer = Buffer.from(file);
        }

        console.log("saveFile: buffer length", buffer.length);

        const extension = resolveFileExtension(originalName, contentType);
        const objectName = `${circleId}/${objectBaseName}${extension}`;
        await minioClient.putObject(bucketName, objectName, buffer, buffer.length, {
            "Content-Type": contentType,
        });

        let fileInfo: FileInfo = {
            originalName: originalName,
            fileName: `${objectBaseName}${extension}`,
            url: "/storage/" + objectName,
        };
        return fileInfo;
    } catch (error) {
        console.error("Error in saveFile:", error);
        throw error;
    }
};

export const saveVerificationFile = async (file: File, requestId: string, messageId: string): Promise<FileInfo> => {
    const originalName = file.name || "verification-attachment";
    const contentType = file.type || "application/octet-stream";
    const extension = resolveFileExtension(originalName, contentType);
    const objectName = `${requestId}/${messageId}/${randomUUID()}${extension}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    if (process.env.LOCAL_FS_STORAGE === "true" && process.env.NODE_ENV !== "production") {
        const privateDir = path.join(process.cwd(), "circles_data", "verification-attachments");
        const filePath = path.join(privateDir, objectName);
        await fs.ensureDir(path.dirname(filePath));
        await fs.writeFile(filePath, buffer);
    } else {
        await ensureVerificationBucketExists();
        await minioClient.putObject(verificationBucketName, objectName, buffer, buffer.length, {
            "Content-Type": contentType,
        });
    }

    return {
        originalName,
        fileName: path.basename(objectName),
        url: `${VERIFICATION_STORAGE_SCHEME}${objectName}`,
    };
};

export const getVerificationFile = async (
    locator: string,
): Promise<{ stream: NodeJS.ReadableStream; contentType: string }> => {
    if (locator.startsWith(VERIFICATION_STORAGE_SCHEME)) {
        const objectName = locator.slice(VERIFICATION_STORAGE_SCHEME.length);
        if (!objectName || objectName.includes("..")) throw new Error("Invalid verification attachment locator");

        if (process.env.LOCAL_FS_STORAGE === "true" && process.env.NODE_ENV !== "production") {
            const privateRoot = path.join(process.cwd(), "circles_data", "verification-attachments");
            const filePath = path.resolve(privateRoot, objectName);
            if (!filePath.startsWith(`${path.resolve(privateRoot)}${path.sep}`)) {
                throw new Error("Invalid verification attachment locator");
            }
            return { stream: fs.createReadStream(filePath), contentType: "application/octet-stream" };
        }

        const stat = await minioClient.statObject(verificationBucketName, objectName);
        return {
            stream: await minioClient.getObject(verificationBucketName, objectName),
            contentType: stat.metaData?.["content-type"] || "application/octet-stream",
        };
    }

    const legacyPrefix = "/storage/";
    const prefixIndex = locator.indexOf(legacyPrefix);
    const objectName = prefixIndex >= 0 ? locator.slice(prefixIndex + legacyPrefix.length) : "";
    if (!isLegacyVerificationObject(objectName)) throw new Error("Invalid verification attachment locator");
    const stat = await minioClient.statObject(bucketName, objectName);
    return {
        stream: await minioClient.getObject(bucketName, objectName),
        contentType: stat.metaData?.["content-type"] || "application/octet-stream",
    };
};

export const isLegacyVerificationObject = (objectName: string): boolean =>
    objectName.split("/").at(-1)?.startsWith("verification-attachment") === true;

// Function to delete a file from MinIO based on its URL
export const deleteFile = async (fileUrl: string): Promise<void> => {
    try {
        // Extract the object name from the URL
        // Assuming URL format like: http://host/storage/circleId/fileNameTimestamp
        // Or production format: https://circles.com/storage/circleId/fileNameTimestamp
        const urlPrefix = "/storage/";
        const objectNameIndex = fileUrl.indexOf(urlPrefix);
        if (objectNameIndex === -1) {
            console.log(`Skipping non-MinIO file delete: ${fileUrl}`);
            return;
        }
        const objectName = fileUrl.substring(objectNameIndex + urlPrefix.length);

        if (!objectName) {
            throw new Error(`Could not extract object name from URL: ${fileUrl}`);
        }

        console.log(`Attempting to delete object: ${objectName} from bucket: ${bucketName}`);
        await minioClient.removeObject(bucketName, objectName);
        console.log(`Successfully deleted object: ${objectName}`);
    } catch (error) {
        console.error(`Error deleting file ${fileUrl}:`, error);
        // Decide if we should throw the error or just log it
        // For now, let's re-throw to indicate failure
        throw error;
    }
};
