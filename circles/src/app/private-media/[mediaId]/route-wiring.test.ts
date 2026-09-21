import { beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { Readable } from "node:stream";
import { ObjectId } from "mongodb";
import { useSpyCleanup } from "@/test/hooks";
import { mockAuthenticatedUser } from "@/test/mock-auth";
import { mockDb } from "@/test/mock-db";
import { createRequest } from "@/test/next-request";

const db = mockDb();

const getAuthenticatedUserDid = mockAuthenticatedUser("did:member");

const { privateMediaMinioClient } = await import("@/lib/data/private-media");
const { GET, runtime } = await import("./route");

const circleId = new ObjectId();
const mediaId = new ObjectId();
const record = {
    _id: mediaId,
    storageClass: "private",
    bucket: "circles-private",
    ownerType: "circle",
    circleId: circleId.toString(),
    objectKey: `circle/${circleId.toHexString()}/0b9f6f4e-3c6e-4c8e-9d2b-1f2a3b4c5d6e.png`,
    contentType: "image/png",
    size: 5,
    originalName: "photo.png",
};

const trackSpy = useSpyCleanup();
const request = (id: string = mediaId.toString()) => GET(createRequest(`/private-media/${id}`), { params: Promise.resolve({ mediaId: id }) });

beforeEach(() => {
    db.PrivateMediaCollection.docs = [{ ...record }];
    db.Circles.docs = [{ _id: circleId, circleType: "circle" }];
    db.Members.docs = [{ _id: new ObjectId(), userDid: "did:member", circleId: circleId.toString(), userGroups: ["members"] }];
    trackSpy(spyOn(privateMediaMinioClient, "statObject").mockResolvedValue({} as never));
    trackSpy(spyOn(privateMediaMinioClient, "getObject").mockResolvedValue(Readable.from([Buffer.from("bytes")]) as never));
});

describe("GET /private-media/[mediaId] route wiring", () => {
    test("runs on the node runtime", () => {
        expect(runtime).toBe("nodejs");
    });

    test("serves a private file to a member of the owning circle, from the private bucket", async () => {
        const response = await request();

        expect(response.status).toBe(200);
        expect(Buffer.from(await response.arrayBuffer()).toString()).toBe("bytes");
        expect(response.headers.get("cache-control")).toBe("private, no-store");
        expect(privateMediaMinioClient.getObject).toHaveBeenCalledWith("circles-private", record.objectKey);
        expect(privateMediaMinioClient.statObject).toHaveBeenCalledWith("circles-private", record.objectKey);
    });

    test("answers 404 to signed-out visitors", async () => {
        getAuthenticatedUserDid.mockResolvedValue(undefined);

        expect((await request()).status).toBe(404);
        expect(privateMediaMinioClient.getObject).not.toHaveBeenCalled();
    });

    test("answers 404 to signed-in users who are not members of the circle", async () => {
        db.Members.docs = [];

        expect((await request()).status).toBe(404);
        expect(privateMediaMinioClient.getObject).not.toHaveBeenCalled();
    });

    test("answers 404 for an unknown file and for one whose object is missing from storage", async () => {
        expect((await request(new ObjectId().toString())).status).toBe(404);

        (privateMediaMinioClient.statObject as unknown as ReturnType<typeof mock>).mockRejectedValue(new Error("NotFound"));
        expect((await request()).status).toBe(404);
    });

    test("answers 404 when the owning circle no longer exists", async () => {
        db.Circles.docs = [];

        expect((await request()).status).toBe(404);
    });

    test("answers 404 for an id that is not an ObjectId", async () => {
        expect((await request("not-an-id")).status).toBe(404);
    });
});
