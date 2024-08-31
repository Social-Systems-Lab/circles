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
    file: File,
    fileName: string,
    circleId: string,
    overwrite: boolean,
): Promise<FileInfo> => {
    await ensureBucketExists();
    if (!overwrite) {
        let fileExists = await checkIfFileExists(circleId, fileName);
        if (fileExists) {
            throw new Error("File already exists");
        }
    }

    const objectName = `${circleId}/${fileName + Date.now()}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    await minioClient.putObject(bucketName, objectName, buffer, buffer.length, {
        "Content-Type": file.type,
    });

    let fileInfo: FileInfo = {
        originalName: file.name,
        fileName: fileName,
        url:
            (process.env.NODE_ENV === "production"
                ? process.env.CIRCLES_URL
                : `http://${process.env.MINIO_HOST || "127.0.0.1"}`) +
            "/storage/" +
            objectName,
    };
    return fileInfo;
};
