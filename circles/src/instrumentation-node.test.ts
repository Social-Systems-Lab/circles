import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { silenceConsole } from "@/test/hooks";

const ensureRequiredChatIndexes = mock(async () => {});
mock.module("@/lib/data/db", () => ({ ensureRequiredChatIndexes }));

const { registerNodeInstrumentation } = await import("./instrumentation-node");

const consoleSpy = silenceConsole("error");
let exit: ReturnType<typeof spyOn>;

beforeEach(() => {
    ensureRequiredChatIndexes.mockReset();
    ensureRequiredChatIndexes.mockResolvedValue(undefined);
    exit = spyOn(process, "exit").mockImplementation((() => undefined) as never);
});

afterEach(() => exit.mockRestore());

describe("registerNodeInstrumentation", () => {
    test("makes sure the required chat indexes exist", async () => {
        await registerNodeInstrumentation();

        expect(ensureRequiredChatIndexes).toHaveBeenCalledTimes(1);
    });

    test("lets the server start when the indexes are in place", async () => {
        await registerNodeInstrumentation();

        expect(exit).not.toHaveBeenCalled();
        expect(consoleSpy.error).not.toHaveBeenCalled();
    });

    test("refuses to start the server, with exit code 1, when the indexes cannot be created", async () => {
        ensureRequiredChatIndexes.mockRejectedValue(new Error("index build failed"));

        await registerNodeInstrumentation();

        expect(exit).toHaveBeenCalledWith(1);
    });

    test("logs why it refused to start", async () => {
        const error = new Error("index build failed");
        ensureRequiredChatIndexes.mockRejectedValue(error);

        await registerNodeInstrumentation();

        expect(consoleSpy.error).toHaveBeenCalledWith("Required chat index initialization failed; refusing to start the Node server.", error);
    });

    test("does not throw when it exits", async () => {
        ensureRequiredChatIndexes.mockRejectedValue(new Error("nope"));

        await expect(registerNodeInstrumentation()).resolves.toBeUndefined();
    });
});
