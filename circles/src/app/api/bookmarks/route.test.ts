import { beforeEach, describe, expect, mock, test } from "bun:test";
import { silenceConsole } from "@/test/hooks";
import { mockAuthenticatedUser } from "@/test/mock-auth";

const getAuthenticatedUserDid = mockAuthenticatedUser();

const getUserPrivate = mock(async (_did: string): Promise<Record<string, unknown>> => ({ bookmarkedCircles: [] }));
mock.module("@/lib/data/user", () => ({ getUserPrivate }));

const getDiscoverableCirclesByIds = mock(async (_ids: string[], _viewerDid?: string): Promise<unknown[]> => []);
mock.module("@/lib/data/circle", () => ({ getDiscoverableCirclesByIds }));

const { GET } = await import("./route");

const consoleSpy = silenceConsole("error");

beforeEach(() => {
    getUserPrivate.mockReset();
    getUserPrivate.mockResolvedValue({ bookmarkedCircles: ["c1", "c2"] });
    getDiscoverableCirclesByIds.mockReset();
    getDiscoverableCirclesByIds.mockResolvedValue([{ _id: "c1" }, { _id: "c2" }]);
});


describe("GET /api/bookmarks", () => {
    test("returns the discoverable circles the user bookmarked", async () => {
        const response = await GET();

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual([{ _id: "c1" }, { _id: "c2" }]);
        expect(getUserPrivate).toHaveBeenCalledWith("did:user");
        expect(getDiscoverableCirclesByIds).toHaveBeenCalledWith(["c1", "c2"], "did:user");
    });

    test("returns an empty list for signed-out visitors without loading anything", async () => {
        getAuthenticatedUserDid.mockResolvedValue(undefined);

        expect(await (await GET()).json()).toEqual([]);
        expect(getUserPrivate).not.toHaveBeenCalled();
    });

    test.each([["an empty list", []], ["no list", undefined]])("returns an empty list when the user has %s of bookmarks", async (_label, bookmarkedCircles) => {
        getUserPrivate.mockResolvedValue({ bookmarkedCircles });

        expect(await (await GET()).json()).toEqual([]);
        expect(getDiscoverableCirclesByIds).not.toHaveBeenCalled();
    });

    test("only returns what the circle lookup says the viewer may discover", async () => {
        getDiscoverableCirclesByIds.mockResolvedValue([{ _id: "c1" }]);

        expect(await (await GET()).json()).toEqual([{ _id: "c1" }]);
    });

    test.each([
        ["authentication fails", () => getAuthenticatedUserDid.mockRejectedValue(new Error("bad token"))],
        ["the profile cannot be loaded", () => getUserPrivate.mockRejectedValue(new Error("db down"))],
        ["the circle lookup fails", () => getDiscoverableCirclesByIds.mockRejectedValue(new Error("db down"))],
    ])("degrades to an empty list, with a 200, when %s", async (_label, arrange) => {
        arrange();

        const response = await GET();

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual([]);
        expect(consoleSpy.error).toHaveBeenCalledWith("Failed to fetch bookmarked circles via API:", expect.any(Error));
    });
});
