import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { setEnv, snapshotEnv } from "@/test/env";
import { silenceConsole, useFakeNow } from "@/test/hooks";

const ENV_NAMES = ["MINIO_HOST", "MINIO_PORT", "MINIO_ROOT_USERNAME", "MINIO_ROOT_PASSWORD", "LOCAL_FS_STORAGE", "NODE_ENV"];
const restoreEnv = snapshotEnv(...ENV_NAMES);
const originalCwd = process.cwd();
const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "circles-storage-test-"));

const clientOptions: Record<string, unknown>[] = [];
const minio = {
    listBuckets: mock(async () => [{ name: "circles" }]),
    bucketExists: mock(async (_bucket: string) => true),
    makeBucket: mock(async (_bucket: string) => {}),
    setBucketPolicy: mock(async (_bucket: string, _policy: string) => {}),
    statObject: mock(async (_bucket: string, _object: string): Promise<unknown> => ({})),
    putObject: mock(async (..._args: unknown[]) => ({})),
    removeObject: mock(async (_bucket: string, _object: string) => {}),
};
mock.module("minio", () => ({
    Client: class FakeMinioClient {
        constructor(options: Record<string, unknown>) {
            clientOptions.push(options);
            Object.assign(this, minio);
        }
    },
}));

// The Minio client and host are built when the module loads, so configurations get their own instances.
let instance = 0;
const loadStorage = async (env: Record<string, string | undefined> = {}) => {
    for (const name of ENV_NAMES) setEnv(name, env[name]);
    instance += 1;
    return (await import(`./storage?instance=${instance}`)) as typeof import("./storage");
};

const NOW = new Date("2026-06-15T12:00:00.000Z");
useFakeNow(NOW);
const consoleSpy = silenceConsole("log", "error");

beforeEach(() => {
    process.chdir(workDir);
    fs.rmSync(path.join(workDir, "public"), { recursive: true, force: true });
    clientOptions.length = 0;
    for (const fn of Object.values(minio)) fn.mockClear();
    minio.bucketExists.mockResolvedValue(true);
    minio.statObject.mockRejectedValue(new Error("Not Found"));
    minio.putObject.mockResolvedValue({});
    minio.removeObject.mockResolvedValue(undefined);
});

afterAll(() => {
    process.chdir(originalCwd);
    fs.rmSync(workDir, { recursive: true, force: true });
    restoreEnv();
});

const png = () => Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const fileLike = (content: string, name: string, type: string) => ({
    name,
    type,
    size: content.length,
    arrayBuffer: async () => new TextEncoder().encode(content).buffer,
});

describe("isFile", () => {
    test("accepts objects with a type and a size", async () => {
        const { isFile } = await loadStorage();

        expect(isFile({ type: "image/png", size: 10 })).toBeTruthy();
    });

    test.each<[unknown]>([[null], [undefined], ["text"], [5], [{}], [{ type: "image/png" }], [{ size: 10 }], [{ type: "", size: 10 }], [{ type: "image/png", size: 0 }]])(
        "rejects %p",
        async (value) => {
            const { isFile } = await loadStorage();

            expect(isFile(value)).toBeFalsy();
        },
    );
});

describe("client configuration", () => {
    test("defaults to a local MinIO with the stock credentials", async () => {
        await loadStorage();

        expect(clientOptions[0]).toEqual({ endPoint: "127.0.0.1", port: 9000, useSSL: false, accessKey: "minioadmin", secretKey: "minioadmin" });
    });

    test("reads endpoint, port and credentials from the environment", async () => {
        await loadStorage({ MINIO_HOST: "minio.internal", MINIO_PORT: "9100", MINIO_ROOT_USERNAME: "svc", MINIO_ROOT_PASSWORD: "hunter2", NODE_ENV: "production" });

        expect(clientOptions[0]).toEqual({ endPoint: "minio.internal", port: 9100, useSSL: false, accessKey: "svc", secretKey: "hunter2" });
    });

    test.each(["db", "minio"])("maps the docker service name %s to localhost outside production", async (host) => {
        await loadStorage({ MINIO_HOST: host, NODE_ENV: "development" });

        expect(clientOptions[0].endPoint).toBe("127.0.0.1");
    });

    test.each(["db", "minio"])("keeps the docker service name %s in production", async (host) => {
        await loadStorage({ MINIO_HOST: host, NODE_ENV: "production" });

        expect(clientOptions[0].endPoint).toBe(host);
    });

    test("only remaps the two docker service names", async () => {
        await loadStorage({ MINIO_HOST: "storage", NODE_ENV: "development" });

        expect(clientOptions[0].endPoint).toBe("storage");
    });
});

describe("listBuckets", () => {
    test("returns the buckets known to MinIO", async () => {
        const { listBuckets } = await loadStorage();

        expect(await listBuckets()).toEqual([{ name: "circles" }] as never);
    });
});

describe("saveFile to MinIO", () => {
    const save = async (file: unknown, fileName = "avatar", circleId = "circle-1", overwrite = false) => {
        const { saveFile } = await loadStorage({ NODE_ENV: "test" });
        return saveFile(file, fileName, circleId, overwrite);
    };

    test("stores a buffer under the circle folder with a timestamped name and returns its storage url", async () => {
        const info = await save(png());

        const stamp = NOW.getTime();
        expect(info).toEqual({ originalName: "unknown", fileName: `avatar${stamp}`, url: `/storage/circle-1/avatar${stamp}` });
        expect(minio.putObject).toHaveBeenCalledWith("circles", `circle-1/avatar${stamp}`, png(), 4, { "Content-Type": "application/octet-stream" });
    });

    test("uses the name, type and extension of a browser file", async () => {
        const info = await save(fileLike("data", "Photo.PNG", "image/png"));

        expect(info.originalName).toBe("Photo.PNG");
        expect(info.fileName).toBe(`avatar${NOW.getTime()}.png`);
        expect(minio.putObject.mock.calls[0][4]).toEqual({ "Content-Type": "image/png" });
    });

    test("derives the extension from the mime type when the name has none", async () => {
        const info = await save(fileLike("data", "photo", "image/webp"));

        expect(info.fileName).toBe(`avatar${NOW.getTime()}.webp`);
    });

    test("falls back to octet-stream for a file without a type", async () => {
        await save(fileLike("data", "notes.txt", ""));

        expect(minio.putObject.mock.calls[0][4]).toEqual({ "Content-Type": "application/octet-stream" });
    });

    test("decodes a base64 data url and uses its mime type", async () => {
        const info = await save(`data:image/png;base64,${Buffer.from("hello").toString("base64")}`);

        expect(info.fileName).toBe(`avatar${NOW.getTime()}.png`);
        expect(minio.putObject.mock.calls[0][2]).toEqual(Buffer.from("hello"));
        expect(minio.putObject.mock.calls[0][4]).toEqual({ "Content-Type": "image/png" });
    });

    test("rejects a malformed data url", async () => {
        await expect(save("data:image/png,not-base64")).rejects.toThrow("Invalid data URL format");

        expect(minio.putObject).not.toHaveBeenCalled();
        expect(consoleSpy.error).toHaveBeenCalledWith("Error in saveFile:", expect.any(Error));
    });

    test("converts other values to a buffer as a last resort", async () => {
        await save(new Uint8Array([1, 2, 3]));

        expect(minio.putObject.mock.calls[0][2]).toEqual(Buffer.from([1, 2, 3]));
    });

    test("creates the public bucket with a read-only policy the first time", async () => {
        minio.bucketExists.mockResolvedValue(false);

        await save(png());

        expect(minio.makeBucket).toHaveBeenCalledWith("circles");
        const policy = JSON.parse(minio.setBucketPolicy.mock.calls[0][1] as string);
        expect(minio.setBucketPolicy.mock.calls[0][0]).toBe("circles");
        expect(policy.Statement).toEqual([
            { Effect: "Allow", Principal: "*", Action: ["s3:GetObject"], Resource: ["arn:aws:s3:::circles/*"] },
        ]);
    });

    test("leaves an existing bucket alone", async () => {
        await save(png());

        expect(minio.makeBucket).not.toHaveBeenCalled();
        expect(minio.setBucketPolicy).not.toHaveBeenCalled();
    });

    test("refuses to replace an existing file unless told to", async () => {
        minio.statObject.mockResolvedValue({});

        await expect(save(png(), "avatar", "circle-1", false)).rejects.toThrow("File already exists");

        expect(minio.statObject).toHaveBeenCalledWith("circles", "circle-1/avatar");
        expect(minio.putObject).not.toHaveBeenCalled();
    });

    test("does not check for an existing file when overwriting", async () => {
        minio.statObject.mockResolvedValue({});

        await save(png(), "avatar", "circle-1", true);

        expect(minio.statObject).not.toHaveBeenCalled();
        expect(minio.putObject).toHaveBeenCalledTimes(1);
    });

    test("propagates upload failures and logs them", async () => {
        minio.putObject.mockRejectedValue(new Error("disk full"));

        await expect(save(png())).rejects.toThrow("disk full");

        expect(consoleSpy.error).toHaveBeenCalledWith("Error in saveFile:", expect.any(Error));
    });
});

describe("saveFile to the local filesystem", () => {
    const uploadDir = () => path.join(workDir, "public", "uploads");
    const saveLocal = async (file: unknown, fileName = "avatar", env: Record<string, string | undefined> = {}) => {
        const { saveFile } = await loadStorage({ LOCAL_FS_STORAGE: "true", NODE_ENV: "development", ...env });
        return saveFile(file, fileName, "circle-1", false);
    };

    test("writes into public/uploads instead of MinIO when LOCAL_FS_STORAGE is on", async () => {
        const info = await saveLocal(png());

        const finalName = `${NOW.getTime()}-avatar`;
        expect(info).toEqual({ originalName: "avatar", fileName: finalName, url: `/uploads/${finalName}` });
        expect(fs.readFileSync(path.join(uploadDir(), finalName))).toEqual(png());
        expect(minio.putObject).not.toHaveBeenCalled();
        expect(minio.bucketExists).not.toHaveBeenCalled();
    });

    test("creates the upload directory when it is missing", async () => {
        expect(fs.existsSync(uploadDir())).toBe(false);

        await saveLocal(png());

        expect(fs.existsSync(uploadDir())).toBe(true);
    });

    test("keeps the extension of the original name, lowercased", async () => {
        const info = await saveLocal(fileLike("data", "Photo.JPG", "image/jpeg"));

        expect(info.originalName).toBe("Photo.JPG");
        expect(info.fileName).toBe(`${NOW.getTime()}-avatar.jpg`);
        expect(fs.readFileSync(path.join(uploadDir(), info.fileName)).toString()).toBe("data");
    });

    test("derives the extension from the mime type when the name has none", async () => {
        const info = await saveLocal(fileLike("data", "photo", "application/pdf"));

        expect(info.fileName).toBe(`${NOW.getTime()}-avatar.pdf`);
    });

    test("adds no extension for an unknown mime type", async () => {
        const info = await saveLocal(fileLike("data", "photo", "application/zip"));

        expect(info.fileName).toBe(`${NOW.getTime()}-avatar`);
    });

    test("decodes a base64 data url", async () => {
        const info = await saveLocal(`data:image/png;base64,${Buffer.from("hello").toString("base64")}`);

        expect(fs.readFileSync(path.join(uploadDir(), info.fileName)).toString()).toBe("hello");
    });

    test("stores an empty file for a malformed data url", async () => {
        const info = await saveLocal("data:image/png,not-base64");

        expect(fs.readFileSync(path.join(uploadDir(), info.fileName))).toHaveLength(0);
    });

    test("never uses the local filesystem in production", async () => {
        const info = await saveLocal(png(), "avatar", { NODE_ENV: "production" });

        expect(info.url.startsWith("/storage/")).toBe(true);
        expect(minio.putObject).toHaveBeenCalledTimes(1);
        expect(fs.existsSync(uploadDir())).toBe(false);
    });

    test("only activates for the exact value 'true'", async () => {
        const info = await saveLocal(png(), "avatar", { LOCAL_FS_STORAGE: "1" });

        expect(info.url.startsWith("/storage/")).toBe(true);
    });
});

describe("deleteFile", () => {
    const remove = async (url: string) => {
        const { deleteFile } = await loadStorage();
        return deleteFile(url);
    };

    test("removes the object named by a storage url", async () => {
        await remove("/storage/circle-1/avatar123.png");

        expect(minio.removeObject).toHaveBeenCalledWith("circles", "circle-1/avatar123.png");
    });

    test("accepts absolute urls", async () => {
        await remove("https://kamooni.example/storage/circle-1/avatar123.png");

        expect(minio.removeObject).toHaveBeenCalledWith("circles", "circle-1/avatar123.png");
    });

    test.each(["/uploads/local.png", "/images/default.png", "https://cdn.example/pic.png", ""])(
        "skips %p because it is not stored in MinIO",
        async (url) => {
            await expect(remove(url)).resolves.toBeUndefined();

            expect(minio.removeObject).not.toHaveBeenCalled();
            expect(consoleSpy.log).toHaveBeenCalledWith(`Skipping non-MinIO file delete: ${url}`);
        },
    );

    test("rejects a storage url without an object name", async () => {
        await expect(remove("/storage/")).rejects.toThrow("Could not extract object name from URL: /storage/");

        expect(minio.removeObject).not.toHaveBeenCalled();
    });

    test("propagates removal failures and logs them", async () => {
        minio.removeObject.mockRejectedValue(new Error("access denied"));

        await expect(remove("/storage/circle-1/a.png")).rejects.toThrow("access denied");

        expect(consoleSpy.error).toHaveBeenCalledWith("Error deleting file /storage/circle-1/a.png:", expect.any(Error));
    });
});
