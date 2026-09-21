import { afterAll, afterEach, describe, expect, mock, test } from "bun:test";
import { setEnv, snapshotEnv } from "@/test/env";

const restoreEnv = snapshotEnv("NEXT_RUNTIME");

const registerNodeInstrumentation = mock(async () => {});
mock.module("./instrumentation-node", () => ({ registerNodeInstrumentation }));

const { register } = await import("./instrumentation");

afterEach(() => registerNodeInstrumentation.mockClear());
afterAll(restoreEnv);

describe("register", () => {
    test("starts the Node instrumentation when running on the Node runtime", async () => {
        setEnv("NEXT_RUNTIME", "nodejs");

        await register();

        expect(registerNodeInstrumentation).toHaveBeenCalledTimes(1);
    });

    test.each(["edge", "", undefined])("does not load the Node instrumentation for the %p runtime", async (runtime) => {
        setEnv("NEXT_RUNTIME", runtime);

        await register();

        expect(registerNodeInstrumentation).not.toHaveBeenCalled();
    });

    test("waits for the Node instrumentation to finish", async () => {
        setEnv("NEXT_RUNTIME", "nodejs");
        let finished = false;
        registerNodeInstrumentation.mockImplementationOnce(async () => {
            await new Promise((resolve) => setTimeout(resolve, 5));
            finished = true;
        });

        await register();

        expect(finished).toBe(true);
    });

    test("propagates a failure of the Node instrumentation", async () => {
        setEnv("NEXT_RUNTIME", "nodejs");
        registerNodeInstrumentation.mockRejectedValueOnce(new Error("boom"));

        await expect(register()).rejects.toThrow("boom");
    });

    test("matches the runtime name exactly", async () => {
        setEnv("NEXT_RUNTIME", "NodeJS");

        await register();

        expect(registerNodeInstrumentation).not.toHaveBeenCalled();
    });
});
