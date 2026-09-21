import { describe, expect, mock, test } from "bun:test";
import { testNodeRuntimeRoute } from "@/test/route-config";

const template = { id: "kamooni-membership-v1", fields: ["circleId"] };
const getKamooniMembershipTemplate = mock(() => template);
mock.module("@/lib/vibe-id/membership-credentials", () => ({ getKamooniMembershipTemplate }));

const route = await import("./route");

describe("GET /.well-known/vibeid/templates/membership-v1.json", () => {
    test("serves the Kamooni membership credential template as JSON", async () => {
        const response = await route.GET();

        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toContain("application/json");
        expect(await response.json()).toEqual(template);
    });

    test("builds the template on every request", async () => {
        getKamooniMembershipTemplate.mockClear();

        await route.GET();
        await route.GET();

        expect(getKamooniMembershipTemplate).toHaveBeenCalledTimes(2);
    });

    testNodeRuntimeRoute(route);
});
