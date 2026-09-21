import { afterEach, describe, expect, test } from "bun:test";
import { setEnv, snapshotEnv } from "./env";

const NAME = "CIRCLES_TEST_ENV_HELPER";

afterEach(() => {
    delete process.env[NAME];
});

describe("setEnv", () => {
    test("sets a variable", () => {
        setEnv(NAME, "value");
        expect(process.env[NAME]).toBe("value");
    });

    test("removes a variable when the value is undefined", () => {
        process.env[NAME] = "value";
        setEnv(NAME, undefined);
        expect(NAME in process.env).toBe(false);
    });

    test("keeps an empty string as an empty string", () => {
        setEnv(NAME, "");
        expect(process.env[NAME]).toBe("");
    });
});

describe("snapshotEnv", () => {
    test("restores a changed variable to its previous value", () => {
        process.env[NAME] = "before";
        const restore = snapshotEnv(NAME);

        setEnv(NAME, "after");
        restore();

        expect(process.env[NAME]).toBe("before");
    });

    test("removes a variable that did not exist when the snapshot was taken", () => {
        const restore = snapshotEnv(NAME);

        setEnv(NAME, "created");
        restore();

        expect(NAME in process.env).toBe(false);
    });

    test("restores a variable that was deleted after the snapshot", () => {
        process.env[NAME] = "before";
        const restore = snapshotEnv(NAME);

        setEnv(NAME, undefined);
        restore();

        expect(process.env[NAME]).toBe("before");
    });

    test("only touches the named variables", () => {
        const restore = snapshotEnv(NAME);
        process.env.CIRCLES_TEST_ENV_OTHER = "kept";

        restore();

        expect(process.env.CIRCLES_TEST_ENV_OTHER).toBe("kept");
        delete process.env.CIRCLES_TEST_ENV_OTHER;
    });
});
