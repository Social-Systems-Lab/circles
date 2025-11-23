// file storage

import fs from "fs-extra";
import path from "path";
import { APP_DIR } from "../auth/auth";
import { Client as MinioClient } from "minio";

const minioClient = new MinioClient({
    endPoint: process.env.MINIO_HOST || "127.0.0.1",
    port: parseInt(process.env.MINIO_PORT || "9000"),
    useSSL: false,
    accessKey: process.env.MINIO_ROOT_USERNAME || "minioadmin",
    secretKey: process.env.MINIO_ROOT_PASSWORD || "minioadmin",
});

const bucketName = "circles";

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
): Promise<FileInfo> => {    // --- Local filesystem override for development ---
    if (process.env.LOCAL_FS_STORAGE === "true" && process.env.NODE_ENV !== "production") {
        const fs = await import("fs");
        const path = await import("path");

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

        const finalName = `${Date.now()}-${fileName}`;
        const filePath = path.join(uploadDir, finalName);
        
        const fileDir = path.dirname(filePath);
        if (!fs.existsSync(fileDir)) {
            fs.mkdirSync(fileDir, { recursive: true });
        }

        fs.writeFileSync(filePath, buffer);

        return {
            originalName: fileName,
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

    const objectName = `${circleId}/${fileName + Date.now()}`;
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

        await minioClient.putObject(bucketName, objectName, buffer, buffer.length, {
            "Content-Type": contentType,
        });

        let fileInfo: FileInfo = {
            originalName: originalName,
            fileName: fileName,
            url:
                (process.env.NODE_ENV === "production"
                    ? process.env.CIRCLES_URL
                    : `http://${process.env.MINIO_HOST || "127.0.0.1"}`) +
                "/storage/" +
                objectName,
        };
        return fileInfo;
    } catch (error) {
        console.error("Error in saveFile:", error);
        throw error;
    }
};

// Function to delete a file from MinIO based on its URL
export const deleteFile = async (fileUrl: string): Promise<void> => {
    try {
        // Extract the object name from the URL
        // Assuming URL format like: http://host/storage/circleId/fileNameTimestamp
        // Or production format: https://circles.com/storage/circleId/fileNameTimestamp
        const urlPrefix = "/storage/";
        const objectNameIndex = fileUrl.indexOf(urlPrefix);
        if (objectNameIndex === -1) {
            throw new Error(`Invalid file URL format: ${fileUrl}`);
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
