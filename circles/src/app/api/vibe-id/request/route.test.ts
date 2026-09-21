import { describe, expect, mock, test } from "bun:test";
import { NextResponse } from "next/server";
import { createJsonRequest } from "@/test/next-request";
import { testNodeRuntimeRoute } from "@/test/route-config";

const createVibeIdRequest = mock(async (_request: Request) => NextResponse.json({ requestId: "r1" }));
mock.module("@/lib/auth/vibe-id", () => ({ createVibeIdRequest }));

const route = await import("./route");

describe("POST /api/vibe-id/request", () => {
    test("hands the request to the VibeID request creator and returns its response", async () => {
        const request = createJsonRequest({ intent: "signin" });

        const response = await route.POST(request);

        expect(createVibeIdRequest).toHaveBeenCalledWith(request);
        expect(await response.json()).toEqual({ requestId: "r1" });
    });

    test("does not swallow handler failures", async () => {
        createVibeIdRequest.mockRejectedValueOnce(new Error("boom"));

        await expect(route.POST(createJsonRequest({}))).rejects.toThrow("boom");
    });

    testNodeRuntimeRoute(route);
});
