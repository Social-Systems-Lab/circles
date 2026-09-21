import { describe, expect, mock, test } from "bun:test";
import { NextResponse } from "next/server";
import { createRequest } from "@/test/next-request";
import { testNodeRuntimeRoute } from "@/test/route-config";

const readVibeIdStatus = mock(async (_request: Request, requestId: string) => NextResponse.json({ status: "pending", requestId }));
mock.module("@/lib/auth/vibe-id", () => ({ readVibeIdStatus }));

const route = await import("./route");

describe("GET /api/vibe-id/status/[requestId]", () => {
    test("reads the status of the request named in the path", async () => {
        const request = createRequest("/api/vibe-id/status/abc");

        const response = await route.GET(request, { params: Promise.resolve({ requestId: "abc" }) });

        expect(readVibeIdStatus).toHaveBeenCalledWith(request, "abc");
        expect(await response.json()).toEqual({ status: "pending", requestId: "abc" });
    });

    test("awaits the route params before using them", async () => {
        const params = new Promise<{ requestId: string }>((resolve) => setTimeout(() => resolve({ requestId: "late" }), 5));

        const response = await route.GET(createRequest("/"), { params });

        expect((await response.json()).requestId).toBe("late");
    });

    test("does not swallow handler failures", async () => {
        readVibeIdStatus.mockRejectedValueOnce(new Error("boom"));

        await expect(route.GET(createRequest("/"), { params: Promise.resolve({ requestId: "x" }) })).rejects.toThrow("boom");
    });

    testNodeRuntimeRoute(route);
});
