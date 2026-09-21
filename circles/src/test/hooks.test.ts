import { afterAll, describe, expect, spyOn, test } from "bun:test";
import { silenceConsole, useFakeNow, useSpyCleanup, useStubbedFetch } from "./hooks";

describe("silenceConsole", () => {
    const silenced = silenceConsole("log", "error");
    const originalWarn = console.warn;

    test("swallows the given methods and records their calls", () => {
        console.log("hello", 1);
        console.error("oops");

        expect(silenced.log).toHaveBeenCalledWith("hello", 1);
        expect(silenced.error).toHaveBeenCalledWith("oops");
    });

    test("gives every test fresh spies", () => {
        expect(silenced.log).not.toHaveBeenCalled();
        expect(silenced.error).not.toHaveBeenCalled();
    });

    test("does not touch methods that were not named", () => {
        expect(console.warn).toBe(originalWarn);
    });

    test("installs a spy for each test", () => {
        expect((console.log as unknown as { mock?: unknown }).mock).toBeDefined();
    });
});

describe("silenceConsole restoration", () => {
    const original = console.info;

    describe("inner scope", () => {
        silenceConsole("log");

        test("silences within the scope", () => {
            expect((console.log as unknown as { mock?: unknown }).mock).toBeDefined();
        });
    });

    test("restores the real methods once the scope's tests are done", () => {
        expect((console.log as unknown as { mock?: unknown }).mock).toBeUndefined();
        expect(console.info).toBe(original);
    });
});

describe("useFakeNow", () => {
    const NOW = new Date("2030-01-02T03:04:05.000Z");
    useFakeNow(NOW);

    test("freezes the clock for each test", () => {
        expect(new Date().getTime()).toBe(NOW.getTime());
        expect(Date.now()).toBe(NOW.getTime());
    });

    test("stays frozen for every test in the scope", () => {
        expect(Date.now()).toBe(NOW.getTime());
    });

    afterAll(() => {
        // Runs after the last test of this describe; the clock must already be back to real time.
        expect(Math.abs(Date.now() - NOW.getTime())).toBeGreaterThan(1000);
    });
});

describe("useSpyCleanup", () => {
    const trackSpy = useSpyCleanup();
    const target = { greet: () => "hello" };

    test("returns the spy it was given", () => {
        const spy = trackSpy(spyOn(target, "greet").mockReturnValue("hijacked"));

        expect(target.greet()).toBe("hijacked");
        expect(spy).toHaveBeenCalledTimes(1);
    });

    test("restored the original after the previous test", () => {
        expect(target.greet()).toBe("hello");
    });

    test("restores several spies", () => {
        const other = { count: () => 1 };
        trackSpy(spyOn(target, "greet").mockReturnValue("a"));
        trackSpy(spyOn(other, "count").mockReturnValue(2));

        expect([target.greet(), other.count()]).toEqual(["a", 2]);
    });

    test("restored them all after that test", () => {
        expect(target.greet()).toBe("hello");
    });
});

describe("useStubbedFetch", () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = useStubbedFetch();

    test("replaces global fetch with the mock, answering an empty JSON body by default", async () => {
        expect(globalThis.fetch).toBe(fetchMock as unknown as typeof fetch);

        const response = await fetch("https://example.test/x", { method: "POST" });

        expect(await response.json()).toEqual({});
        expect(fetchMock).toHaveBeenCalledWith("https://example.test/x", { method: "POST" });
    });

    test("lets a test choose the response", async () => {
        fetchMock.mockResolvedValueOnce(Response.json({ ok: true }, { status: 201 }));

        const response = await fetch("https://example.test/y");

        expect(response.status).toBe(201);
        expect(await response.json()).toEqual({ ok: true });
    });

    test("resets the mock between tests", async () => {
        expect(fetchMock).not.toHaveBeenCalled();
        expect(await (await fetch("https://example.test/z")).json()).toEqual({});
    });

    afterAll(() => {
        expect(globalThis.fetch).toBe(originalFetch);
    });
});
