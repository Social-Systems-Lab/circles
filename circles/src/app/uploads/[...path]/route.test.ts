import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { Readable } from "node:stream";
import { setEnv, snapshotEnv } from "@/test/env";
import { silenceConsole } from "@/test/hooks";
import { createRequest } from "@/test/next-request";

const restoreEnv = snapshotEnv("MINIO_HOST", "MINIO_PORT", "MINIO_ROOT_USERNAME", "MINIO_ROOT_PASSWORD", "MINIO_BUCKET");

const clientOptions: Record<string, unknown>[] = [];
const getObject = mock(async (_bucket: string, _objectName: string): Promise<Readable> => Readable.from([Buffer.from("file-bytes")]));
mock.module("minio", () => ({
    Client: class FakeMinioClient {
        constructor(options: Record<string, unknown>) {
            clientOptions.push(options);
        }
        getObject = getObject;
    },
}));

// The uploads route does not consult the access policy; the mock makes any accidental use visible.
const getStoredObjectAccess = mock(async (_objectName: string) => "denied");
mock.module("@/lib/data/media-access", () => ({ getStoredObjectAccess }));

const { GET } = await import("./route");

const consoleSpy = silenceConsole("error");
const fetchObject = (...segments: string[]) => GET(createRequest("/uploads/x"), { params: Promise.resolve({ path: segments }) });

beforeEach(() => {
    for (const name of ["MINIO_HOST", "MINIO_PORT", "MINIO_ROOT_USERNAME", "MINIO_ROOT_PASSWORD", "MINIO_BUCKET"]) setEnv(name, undefined);
    clientOptions.length = 0;
    getObject.mockReset();
    getObject.mockImplementation(async () => Readable.from([Buffer.from("file-bytes")]));
    getStoredObjectAccess.mockClear();
});

afterAll(restoreEnv);

describe("GET /uploads/[...path]", () => {
    test("streams the object with a no-store cache policy", async () => {
        const response = await fetchObject("abc", "pic.png");

        expect(response.status).toBe(200);
        expect(response.headers.get("cache-control")).toBe("no-store");
        expect(Buffer.from(await response.arrayBuffer()).toString()).toBe("file-bytes");
    });

    test("joins the path segments into the object name", async () => {
        await fetchObject("owner", "folder", "pic.png");

        expect(getObject).toHaveBeenCalledWith("circles", "owner/folder/pic.png");
    });

    test.each([
        ["a.png", "image/png"],
        ["a.jpg", "image/jpeg"],
        ["a.jpeg", "image/jpeg"],
        ["a.webp", "image/webp"],
        ["a.gif", "image/gif"],
        ["a.svg", "image/svg+xml"],
        ["a.pdf", "application/octet-stream"],
        ["noextension", "application/octet-stream"],
    ])("serves %s as %s", async (name, contentType) => {
        expect((await fetchObject("owner", name)).headers.get("content-type")).toBe(contentType);
    });

    test("recognizes extensions case-insensitively", async () => {
        expect((await fetchObject("owner", "PHOTO.WEBP")).headers.get("content-type")).toBe("image/webp");
    });

    test("rejects a missing object path", async () => {
        const response = await fetchObject();

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: "Missing object path" });
        expect(getObject).not.toHaveBeenCalled();
    });

    test("treats a missing path list as an empty path", async () => {
        const response = await GET(createRequest("/uploads"), { params: Promise.resolve({ path: undefined as unknown as string[] }) });

        expect(response.status).toBe(400);
    });

    // Unlike /storage, this route never checks whether the owning circle is readable, so objects of paused or
    // removed circles are still served here. Pinned as current behavior.
    test("does not apply the media access policy", async () => {
        const response = await fetchObject("removed-circle", "pic.png");

        expect(response.status).toBe(200);
        expect(getStoredObjectAccess).not.toHaveBeenCalled();
    });

    test("answers 502 without leaking details when storage fails, and logs them", async () => {
        getObject.mockRejectedValue(new Error("The specified key does not exist."));

        const response = await fetchObject("owner", "missing.png");

        expect(response.status).toBe(502);
        expect(await response.json()).toEqual({ error: "Storage fetch failed" });
        expect(consoleSpy.error).toHaveBeenCalledWith(
            "[storage proxy] failed",
            expect.objectContaining({ bucket: "circles", objectName: "owner/missing.png" }),
        );
    });

    test("accepts string chunks as well as buffers", async () => {
        getObject.mockImplementation(async () => Readable.from(["ab", Buffer.from("cd")]));

        expect(Buffer.from(await (await fetchObject("owner", "pic.png")).arrayBuffer()).toString()).toBe("abcd");
    });

    describe("storage configuration", () => {
        test("defaults to a local MinIO with the stock credentials and the circles bucket", async () => {
            await fetchObject("owner", "pic.png");

            expect(clientOptions[0]).toEqual({ endPoint: "127.0.0.1", port: 9000, useSSL: false, accessKey: "minioadmin", secretKey: "minioadmin" });
        });

        test("reads the endpoint, credentials and bucket from the environment", async () => {
            setEnv("MINIO_HOST", "minio.internal");
            setEnv("MINIO_PORT", "9100");
            setEnv("MINIO_ROOT_USERNAME", "svc");
            setEnv("MINIO_ROOT_PASSWORD", "hunter2");
            setEnv("MINIO_BUCKET", "media");

            await fetchObject("owner", "pic.png");

            expect(clientOptions[0]).toEqual({ endPoint: "minio.internal", port: 9100, useSSL: false, accessKey: "svc", secretKey: "hunter2" });
            expect(getObject).toHaveBeenCalledWith("media", "owner/pic.png");
        });
    });
});
