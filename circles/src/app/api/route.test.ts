import { describe, expect, test } from "bun:test";
import { GET } from "./route";

describe("GET /api", () => {
    test("returns a hello world message", async () => {
        const response = await GET();

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual([{ message: "Hello, World!" }]);
    });

    test("responds with JSON", async () => {
        expect((await GET()).headers.get("content-type")).toContain("application/json");
    });
});
