import { describe, expect, mock, test } from "bun:test";
import { mockAuthenticatedUser } from "@/test/mock-auth";
import { createJsonRequest } from "@/test/next-request";

const circle = { _id: "circle-1", handle: "demo", circleType: "circle", enabledModules: ["home", "feed"], accessRules: {}, createdBy: "did:owner" };

const getCircleByHandle = mock(async (_handle: string): Promise<unknown> => circle);
const isCirclePublished = mock((_circle: unknown) => true);
mock.module("@/lib/data/circle", () => ({ getCircleByHandle, isCirclePublished }));

const getMember = mock(async (_did: string, _circleId: string): Promise<unknown> => null);
mock.module("@/lib/data/member", () => ({ getMember }));

const getAuthenticatedUserDid = mockAuthenticatedUser(null);

const canReadCircle = mock(async (_viewerDid: string | undefined, _circle: unknown) => true);
mock.module("@/lib/data/circle-visibility-policy", () => ({ canReadCircle }));

const { POST } = await import("./route");

const ask = (body: unknown) => POST(createJsonRequest(body));

describe("POST /api/access route wiring", () => {
    test("is the access handler", () => {
        expect(typeof POST).toBe("function");
    });

    test("looks the circle up by handle and answers for its enabled modules", async () => {
        const response = await ask({ circleHandle: "demo", moduleHandle: "feed" });

        expect(getCircleByHandle).toHaveBeenCalledWith("demo");
        expect(await response.json()).toEqual({ authenticated: true, authorized: true });
    });

    test("treats a module the circle has not enabled as not found", async () => {
        const response = await ask({ circleHandle: "demo", moduleHandle: "goals" });

        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({ notFound: true, notFoundType: "module" });
    });

    test("consults the visibility policy with the authenticated viewer", async () => {
        getAuthenticatedUserDid.mockResolvedValueOnce("did:viewer");

        await ask({ circleHandle: "demo", moduleHandle: "feed" });

        expect(canReadCircle).toHaveBeenCalledWith("did:viewer", circle);
    });

    test("answers with a neutral not-found when the visibility policy denies access", async () => {
        canReadCircle.mockResolvedValueOnce(false);

        const response = await ask({ circleHandle: "demo", moduleHandle: "feed" });

        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({ notFound: true, notFoundType: "circle" });
    });

    test("uses the membership lookup for view rules that need it", async () => {
        getCircleByHandle.mockResolvedValueOnce({ ...circle, accessRules: { feed: { view: ["members"] } } });
        getAuthenticatedUserDid.mockResolvedValueOnce("did:viewer");
        getMember.mockResolvedValueOnce({ userGroups: ["members"] });

        const response = await ask({ circleHandle: "demo", moduleHandle: "feed" });

        expect(getMember).toHaveBeenCalledWith("did:viewer", "circle-1");
        expect(await response.json()).toEqual({ authenticated: true, authorized: true });
    });

    test("uses the publication check for unpublished circles", async () => {
        isCirclePublished.mockReturnValueOnce(false);

        const response = await ask({ circleHandle: "demo", moduleHandle: "feed" });

        expect(response.status).toBe(404);
        expect((await response.json()).notFoundType).toBe("circle");
    });
});
