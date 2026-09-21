// Lifecycle helpers for module tests. Each one registers its own `beforeEach`/`afterEach` hooks in the
// scope it is called from (a file or a `describe` block), so a test file states what it needs in one line
// instead of repeating the same setup and teardown.

import { afterEach, beforeEach, mock, setSystemTime, spyOn } from "bun:test";

type ConsoleMethod = "log" | "warn" | "error";
type Spy = ReturnType<typeof spyOn>;

/**
 * Silence the given console methods for every test and expose the spies, so tests can assert on what was
 * logged without cluttering the run output:
 *
 *   const consoleSpy = silenceConsole("error");
 *   ...
 *   expect(consoleSpy.error).toHaveBeenCalledWith("Something failed:", expect.any(Error));
 */
export function silenceConsole<M extends ConsoleMethod>(...methods: M[]): Record<M, Spy> {
    const spies = {} as Record<M, Spy>;

    beforeEach(() => {
        for (const method of methods) {
            spies[method] = spyOn(console, method as "log").mockImplementation(() => {});
        }
    });

    afterEach(() => {
        for (const method of methods) spies[method].mockRestore();
    });

    return spies;
}

/** Freeze the clock at `now` for every test, and restore the real clock afterwards. */
export function useFakeNow(now: Date): void {
    beforeEach(() => setSystemTime(now));
    afterEach(() => setSystemTime());
}

/**
 * Returns a function that registers a spy for automatic restoration after each test. Use it for spies
 * installed inside a test on objects that outlive it, such as the shared fake collections:
 *
 *   const trackSpy = useSpyCleanup();
 *   trackSpy(spyOn(db.Circles, "updateOne").mockRejectedValue(new Error("db down")));
 */
export function useSpyCleanup(): <T extends { mockRestore(): void }>(spy: T) => T {
    const spies: { mockRestore(): void }[] = [];

    afterEach(() => {
        for (const spy of spies.splice(0)) spy.mockRestore();
    });

    return (spy) => {
        spies.push(spy);
        return spy;
    };
}

/**
 * Replace `globalThis.fetch` with a mock for every test and put the original back afterwards. The mock is
 * reset before each test and answers with an empty JSON object unless the test says otherwise.
 */
export function useStubbedFetch() {
    const originalFetch = globalThis.fetch;
    const fetchMock = mock(async (_url: string | URL | Request, _init?: RequestInit): Promise<Response> => Response.json({}));

    beforeEach(() => {
        fetchMock.mockReset();
        fetchMock.mockImplementation(async () => Response.json({}));
        globalThis.fetch = fetchMock as unknown as typeof fetch;
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
    });

    return fetchMock;
}
