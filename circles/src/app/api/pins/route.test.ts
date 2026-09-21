import { beforeEach, describe, expect, mock, test } from "bun:test";
import { ObjectId } from "mongodb";
import { silenceConsole } from "@/test/hooks";
import { mockAuthenticatedUser } from "@/test/mock-auth";
import { createJsonRequest, createRequest } from "@/test/next-request";

const getAuthenticatedUserDid = mockAuthenticatedUser();

const getUserPrivate = mock(async (_did: string): Promise<Record<string, unknown>> => ({ did: "did:user", pinnedCircles: [] }));
const pinCircle = mock(async (_did: string, _circleId: string) => {});
const unpinCircle = mock(async (_did: string, _circleId: string) => {});
mock.module("@/lib/data/user", () => ({ getUserPrivate, pinCircle, unpinCircle }));

const getDiscoverableCirclesByIds = mock(async (_ids: string[], _viewerDid?: string): Promise<Record<string, unknown>[]> => []);
mock.module("@/lib/data/circle", () => ({ getDiscoverableCirclesByIds }));

const { DELETE, GET, POST } = await import("./route");

const consoleSpy = silenceConsole("error");

beforeEach(() => {
    getUserPrivate.mockReset();
    getUserPrivate.mockResolvedValue({ did: "did:user", pinnedCircles: [] });
    pinCircle.mockReset();
    unpinCircle.mockReset();
    getDiscoverableCirclesByIds.mockReset();
    getDiscoverableCirclesByIds.mockResolvedValue([]);
});


describe("GET /api/pins", () => {
    test("returns the pinned circles in pinned order, not lookup order", async () => {
        const [a, b, c] = [new ObjectId(), new ObjectId(), new ObjectId()];
        getUserPrivate.mockResolvedValue({ pinnedCircles: [c.toString(), a.toString(), b.toString()] });
        getDiscoverableCirclesByIds.mockResolvedValue([{ _id: a }, { _id: b }, { _id: c }]);

        const circles = await (await GET()).json();

        expect(circles.map((circle: { _id: string }) => circle._id)).toEqual([c.toString(), a.toString(), b.toString()]);
        expect(getDiscoverableCirclesByIds).toHaveBeenCalledWith([c.toString(), a.toString(), b.toString()], "did:user");
    });

    test("drops pinned circles the viewer can no longer discover", async () => {
        const [a, b] = [new ObjectId(), new ObjectId()];
        getUserPrivate.mockResolvedValue({ pinnedCircles: [a.toString(), b.toString()] });
        getDiscoverableCirclesByIds.mockResolvedValue([{ _id: b }]);

        expect((await (await GET()).json()).map((circle: { _id: string }) => circle._id)).toEqual([b.toString()]);
    });

    test("returns an empty list for signed-out visitors without loading anything", async () => {
        getAuthenticatedUserDid.mockResolvedValue(undefined);

        expect(await (await GET()).json()).toEqual([]);
        expect(getUserPrivate).not.toHaveBeenCalled();
    });

    test.each([["an empty list", []], ["no list", undefined]])("returns an empty list when the user has %s of pins", async (_label, pinnedCircles) => {
        getUserPrivate.mockResolvedValue({ pinnedCircles });

        expect(await (await GET()).json()).toEqual([]);
        expect(getDiscoverableCirclesByIds).not.toHaveBeenCalled();
    });

    test("degrades to an empty list with a 200 when anything fails, and logs the error", async () => {
        getUserPrivate.mockRejectedValue(new Error("db down"));

        const response = await GET();

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual([]);
        expect(consoleSpy.error).toHaveBeenCalledWith("GET /api/pins failed:", expect.any(Error));
    });
});

describe("POST /api/pins", () => {
    const post = (body: unknown) => POST(createJsonRequest(body));

    test("pins a discoverable circle and returns the refreshed user", async () => {
        getDiscoverableCirclesByIds.mockResolvedValue([{ _id: "c1" }]);
        getUserPrivate.mockResolvedValue({ did: "did:user", pinnedCircles: ["c1"] });

        const response = await post({ circleId: "c1" });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ user: { did: "did:user", pinnedCircles: ["c1"] } });
        expect(getDiscoverableCirclesByIds).toHaveBeenCalledWith(["c1"], "did:user");
        expect(pinCircle).toHaveBeenCalledWith("did:user", "c1");
    });

    test("does not pin a circle the viewer cannot discover", async () => {
        const response = await post({ circleId: "secret" });

        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({ error: "circle not found" });
        expect(pinCircle).not.toHaveBeenCalled();
    });

    test.each([["missing", {}], ["empty", { circleId: "" }]])("requires a circle id (%s)", async (_label, body) => {
        const response = await post(body);

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: "circleId required" });
        expect(pinCircle).not.toHaveBeenCalled();
    });

    test("rejects signed-out callers", async () => {
        getAuthenticatedUserDid.mockResolvedValue(undefined);

        const response = await post({ circleId: "c1" });

        expect(response.status).toBe(401);
        expect(await response.json()).toEqual({ error: "unauthorized" });
        expect(pinCircle).not.toHaveBeenCalled();
    });

    test("returns a generic 500 when pinning fails, and logs the error", async () => {
        getDiscoverableCirclesByIds.mockResolvedValue([{ _id: "c1" }]);
        pinCircle.mockRejectedValue(new Error("db down"));

        const response = await post({ circleId: "c1" });

        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({ error: "failed" });
        expect(consoleSpy.error).toHaveBeenCalledWith("POST /api/pins failed:", expect.any(Error));
    });

    test("returns a generic 500 for a body that is not JSON", async () => {
        expect((await POST(createJsonRequest("{broken"))).status).toBe(500);
    });
});

describe("DELETE /api/pins", () => {
    const remove = (query: string) => DELETE(createRequest(`/api/pins${query}`, { method: "DELETE" }));

    test("unpins the circle and returns the refreshed user", async () => {
        getUserPrivate.mockResolvedValue({ did: "did:user", pinnedCircles: [] });

        const response = await remove("?circleId=c1");

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ user: { did: "did:user", pinnedCircles: [] } });
        expect(unpinCircle).toHaveBeenCalledWith("did:user", "c1");
    });

    test("does not check discoverability, so a circle that became hidden can still be unpinned", async () => {
        await remove("?circleId=c1");

        expect(getDiscoverableCirclesByIds).not.toHaveBeenCalled();
    });

    test.each(["", "?circleId="])("requires a circle id (%p)", async (query) => {
        const response = await remove(query);

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: "circleId required" });
        expect(unpinCircle).not.toHaveBeenCalled();
    });

    test("rejects signed-out callers", async () => {
        getAuthenticatedUserDid.mockResolvedValue(undefined);

        const response = await remove("?circleId=c1");

        expect(response.status).toBe(401);
        expect(unpinCircle).not.toHaveBeenCalled();
    });

    test("returns a generic 500 when unpinning fails, and logs the error", async () => {
        unpinCircle.mockRejectedValue(new Error("db down"));

        const response = await remove("?circleId=c1");

        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({ error: "failed" });
        expect(consoleSpy.error).toHaveBeenCalledWith("DELETE /api/pins failed:", expect.any(Error));
    });
});
