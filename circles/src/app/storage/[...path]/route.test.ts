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

const getStoredObjectAccess = mock(async (_objectName: string): Promise<"public" | "authenticated" | "denied"> => "public");
mock.module("@/lib/data/media-access", () => ({ getStoredObjectAccess }));

const { GET } = await import("./route");

const consoleSpy = silenceConsole("error");
const fetchObject = (...segments: string[] | [undefined]) =>
    GET(createRequest("/storage/x"), { params: Promise.resolve({ path: segments as unknown as string[] }) });

beforeEach(() => {
    for (const name of ["MINIO_HOST", "MINIO_PORT", "MINIO_ROOT_USERNAME", "MINIO_ROOT_PASSWORD", "MINIO_BUCKET"]) setEnv(name, undefined);
    clientOptions.length = 0;
    getObject.mockReset();
    getObject.mockImplementation(async () => Readable.from([Buffer.from("file-bytes")]));
    getStoredObjectAccess.mockReset();
    getStoredObjectAccess.mockResolvedValue("public");
});

afterAll(restoreEnv);

describe("GET /storage/[...path]", () => {
    test("streams the object with a no-store cache policy", async () => {
        const response = await fetchObject("abc", "pic.png");

        expect(response.status).toBe(200);
        expect(response.headers.get("cache-control")).toBe("no-store");
        expect(Buffer.from(await response.arrayBuffer()).toString()).toBe("file-bytes");
    });

    test("joins the path segments into the object name", async () => {
        await fetchObject("owner", "folder", "pic.png");

        expect(getObject).toHaveBeenCalledWith("circles", "owner/folder/pic.png");
        expect(getStoredObjectAccess).toHaveBeenCalledWith("owner/folder/pic.png");
    });

    test.each([
        ["a.png", "image/png"],
        ["a.jpg", "image/jpeg"],
        ["a.jpeg", "image/jpeg"],
        ["a.webp", "image/webp"],
        ["a.gif", "image/gif"],
        ["a.svg", "image/svg+xml"],
        ["a.pdf", "application/octet-stream"],
        ["a.html", "application/octet-stream"],
        ["noextension", "application/octet-stream"],
        ["png", "application/octet-stream"],
    ])("serves %s as %s", async (name, contentType) => {
        expect((await fetchObject("owner", name)).headers.get("content-type")).toBe(contentType);
    });

    test("recognizes extensions case-insensitively", async () => {
        expect((await fetchObject("owner", "PHOTO.JPG")).headers.get("content-type")).toBe("image/jpeg");
    });

    test("only looks at the end of the name for the extension", async () => {
        expect((await fetchObject("owner", "a.png.exe")).headers.get("content-type")).toBe("application/octet-stream");
    });

    test.each([[[]], [[undefined]]])("rejects a missing object path (%p)", async (segments) => {
        const response = await GET(createRequest("/storage"), { params: Promise.resolve({ path: segments as unknown as string[] }) });

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: "Missing object path" });
        expect(getObject).not.toHaveBeenCalled();
    });

    test("treats a missing path list as an empty path", async () => {
        const response = await GET(createRequest("/storage"), { params: Promise.resolve({ path: undefined as unknown as string[] }) });

        expect(response.status).toBe(400);
    });

    test("answers 404 without touching storage for objects the access policy denies", async () => {
        getStoredObjectAccess.mockResolvedValue("denied");

        const response = await fetchObject("secret-circle", "pic.png");

        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({ error: "Not found" });
        expect(getObject).not.toHaveBeenCalled();
        expect(clientOptions).toHaveLength(0);
    });

    test("serves objects that require authentication as if public, since the route does not authenticate", async () => {
        getStoredObjectAccess.mockResolvedValue("authenticated");

        expect((await fetchObject("owner", "pic.png")).status).toBe(200);
    });

    test("answers 502 without leaking details when storage fails, and logs them", async () => {
        getObject.mockRejectedValue(new Error("The specified key does not exist. secret-host"));

        const response = await fetchObject("owner", "missing.png");

        expect(response.status).toBe(502);
        expect(await response.json()).toEqual({ error: "Storage fetch failed" });
        expect(consoleSpy.error).toHaveBeenCalledWith(
            "[storage proxy] failed",
            expect.objectContaining({ bucket: "circles", objectName: "owner/missing.png" }),
        );
    });

    test("answers 502 when the stream fails part way", async () => {
        getObject.mockImplementation(async () => {
            const stream = new Readable({ read() {} });
            queueMicrotask(() => stream.destroy(new Error("connection reset")));
            return stream;
        });

        expect((await fetchObject("owner", "pic.png")).status).toBe(502);
    });

    test("accepts string chunks as well as buffers", async () => {
        getObject.mockImplementation(async () => Readable.from(["ab", Buffer.from("cd"), "ef"]));

        expect(Buffer.from(await (await fetchObject("owner", "pic.png")).arrayBuffer()).toString()).toBe("abcdef");
    });

    test("serves an empty object as an empty body", async () => {
        getObject.mockImplementation(async () => Readable.from([]));

        const response = await fetchObject("owner", "empty.png");

        expect(response.status).toBe(200);
        expect((await response.arrayBuffer()).byteLength).toBe(0);
    });

    describe("storage configuration", () => {
        test("defaults to a local MinIO with the stock credentials and the circles bucket", async () => {
            await fetchObject("owner", "pic.png");

            expect(clientOptions[0]).toEqual({ endPoint: "127.0.0.1", port: 9000, useSSL: false, accessKey: "minioadmin", secretKey: "minioadmin" });
            expect(getObject).toHaveBeenCalledWith("circles", "owner/pic.png");
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

        test("does not put credentials in error logs for the caller", async () => {
            setEnv("MINIO_ROOT_PASSWORD", "hunter2");
            getObject.mockRejectedValue(new Error("boom"));

            const response = await fetchObject("owner", "pic.png");

            expect(JSON.stringify(await response.json())).not.toContain("hunter2");
        });
    });
});
