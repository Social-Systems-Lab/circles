import { beforeEach, describe, expect, mock, test } from "bun:test";
import { errors } from "jose";
import { silenceConsole } from "@/test/hooks";
import { mockAuthenticatedUser } from "@/test/mock-auth";
import { createRequest } from "@/test/next-request";

const getAuthenticatedUserDid = mockAuthenticatedUser("did:viewer");

const searchDiscoverableCircles = mock(async (_options: Record<string, unknown>): Promise<unknown[]> => [{ _id: "c1" }]);
mock.module("@/lib/data/search", () => ({ searchDiscoverableCircles }));

const { GET } = await import("./route");

const consoleSpy = silenceConsole("error");

beforeEach(() => {
    searchDiscoverableCircles.mockReset();
    searchDiscoverableCircles.mockResolvedValue([{ _id: "c1" }]);
});


const search = (query: string) => GET(createRequest(`/api/circles/search${query}`));

describe("GET /api/circles/search", () => {
    test("returns the circles that match the query", async () => {
        const response = await search("?q=garden");

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ circles: [{ _id: "c1" }] });
    });

    test("searches on behalf of the signed-in viewer with a default limit of 10", async () => {
        await search("?q=garden");

        expect(searchDiscoverableCircles).toHaveBeenCalledWith({
            query: "garden",
            limit: 10,
            circleTypes: undefined,
            viewerDid: "did:viewer",
        });
    });

    test("trims the query", async () => {
        await search("?q=%20%20garden%20");

        expect(searchDiscoverableCircles.mock.calls[0][0].query).toBe("garden");
    });

    test.each(["", "?q=", "?q=%20%20", "?limit=5"])("returns no circles without searching for the query string %p", async (query) => {
        const response = await search(query);

        expect(await response.json()).toEqual({ circles: [] });
        expect(searchDiscoverableCircles).not.toHaveBeenCalled();
    });

    test("restricts the search to the requested circle type", async () => {
        await search("?q=x&type=project");

        expect(searchDiscoverableCircles.mock.calls[0][0].circleTypes).toEqual(["project"]);
    });

    test("does not validate the circle type", async () => {
        await search("?q=x&type=bogus");

        expect(searchDiscoverableCircles.mock.calls[0][0].circleTypes).toEqual(["bogus"]);
    });

    describe("limit", () => {
        test.each([
            ["5", 5],
            ["25", 25],
            ["26", 25],
            ["1000", 25],
            ["0", 1],
            ["-4", 1],
        ])("clamps a requested limit of %s to %d", async (limit, expected) => {
            await search(`?q=x&limit=${limit}`);

            expect(searchDiscoverableCircles.mock.calls[0][0].limit).toBe(expected);
        });

        test("passes an unparseable limit through as NaN", async () => {
            await search("?q=x&limit=abc");

            expect(searchDiscoverableCircles.mock.calls[0][0].limit).toBeNaN();
        });

        test("keeps a fractional limit", async () => {
            await search("?q=x&limit=2.5");

            expect(searchDiscoverableCircles.mock.calls[0][0].limit).toBe(2.5);
        });
    });

    describe("viewer", () => {
        test("searches anonymously when nobody is signed in", async () => {
            getAuthenticatedUserDid.mockResolvedValue(undefined);

            await search("?q=x");

            expect(searchDiscoverableCircles.mock.calls[0][0].viewerDid).toBeUndefined();
        });

        test("searches anonymously when the session token is invalid or expired", async () => {
            getAuthenticatedUserDid.mockRejectedValue(new errors.JWTExpired("expired", {} as never));

            await search("?q=x");

            expect(searchDiscoverableCircles.mock.calls[0][0].viewerDid).toBeUndefined();
        });

        test("fails on unexpected authentication errors rather than searching anonymously", async () => {
            getAuthenticatedUserDid.mockRejectedValue(new Error("cookie store unavailable"));

            const response = await search("?q=x");

            expect(response.status).toBe(500);
            expect(searchDiscoverableCircles).not.toHaveBeenCalled();
        });
    });

    test("returns an empty result with a 500 when the search fails, and logs the error", async () => {
        searchDiscoverableCircles.mockRejectedValue(new Error("index down"));

        const response = await search("?q=x");

        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({ circles: [] });
        expect(consoleSpy.error).toHaveBeenCalledWith("GET /api/circles/search failed:", expect.any(Error));
    });
});
