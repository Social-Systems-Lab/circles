import { describe, expect, mock, test } from "bun:test";
import { NextResponse } from "next/server";
import { createJsonRequest } from "@/test/next-request";
import { testNodeRuntimeRoute } from "@/test/route-config";

const handleVibeIdCallback = mock(async (_request: Request) => NextResponse.json({ success: true, handled: "callback" }));
mock.module("@/lib/auth/vibe-id", () => ({ handleVibeIdCallback }));

const route = await import("./route");

describe("POST /api/vibe-id/callback", () => {
    test("hands the request to the VibeID callback handler and returns its response", async () => {
        const request = createJsonRequest({ requestId: "r1" });

        const response = await route.POST(request);

        expect(handleVibeIdCallback).toHaveBeenCalledWith(request);
        expect(await response.json()).toEqual({ success: true, handled: "callback" });
    });

    test("does not swallow handler failures", async () => {
        handleVibeIdCallback.mockRejectedValueOnce(new Error("boom"));

        await expect(route.POST(createJsonRequest({}))).rejects.toThrow("boom");
    });

    testNodeRuntimeRoute(route);
});
