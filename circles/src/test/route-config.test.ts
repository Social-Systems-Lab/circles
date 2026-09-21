import { describe, expect, test } from "bun:test";
import { testNodeRuntimeRoute } from "./route-config";

describe("testNodeRuntimeRoute", () => {
    // These registered tests pass only for a route that declares both settings.
    testNodeRuntimeRoute({ runtime: "nodejs", dynamic: "force-dynamic" });

    test("is a function that registers a test", () => {
        expect(typeof testNodeRuntimeRoute).toBe("function");
    });
});
