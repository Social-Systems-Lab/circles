import { describe, expect, mock, test } from "bun:test";
import { NextResponse } from "next/server";
import { createJsonRequest } from "@/test/next-request";
import { testNodeRuntimeRoute } from "@/test/route-config";

const completeVibeIdSignup = mock(async (_request: Request) => NextResponse.json({ success: true, handled: "complete" }));
mock.module("@/lib/auth/vibe-id", () => ({ completeVibeIdSignup }));

const route = await import("./route");

describe("POST /api/vibe-id/complete", () => {
    test("hands the request to the VibeID signup handler and returns its response", async () => {
        const request = createJsonRequest({ requestId: "r1", name: "Vee", email: "vee@example.com" });

        const response = await route.POST(request);

        expect(completeVibeIdSignup).toHaveBeenCalledWith(request);
        expect(await response.json()).toEqual({ success: true, handled: "complete" });
    });

    test("does not swallow handler failures", async () => {
        completeVibeIdSignup.mockRejectedValueOnce(new Error("boom"));

        await expect(route.POST(createJsonRequest({}))).rejects.toThrow("boom");
    });

    testNodeRuntimeRoute(route);
});
