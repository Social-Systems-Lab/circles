import { afterEach, beforeEach, describe, expect, jest, mock, test } from "bun:test";
import { renderHook } from "@testing-library/react";
import { useThrottle } from "./use-throttle";

beforeEach(() => {
    jest.useFakeTimers();
});

afterEach(() => {
    jest.useRealTimers();
});

describe("useThrottle", () => {
    test("calls the callback immediately on the first invocation", () => {
        const callback = mock((_value: number) => {});
        const { result } = renderHook(() => useThrottle(callback, 100));

        result.current(1);

        expect(callback).toHaveBeenCalledTimes(1);
        expect(callback).toHaveBeenCalledWith(1);
    });

    test("drops calls made within the delay instead of deferring them", () => {
        const callback = mock((_value: number) => {});
        const { result } = renderHook(() => useThrottle(callback, 100));

        result.current(1);
        result.current(2);
        result.current(3);
        jest.advanceTimersByTime(500);

        expect(callback.mock.calls).toEqual([[1]]);
    });

    test("allows another call once the delay has passed", () => {
        const callback = mock((_value: number) => {});
        const { result } = renderHook(() => useThrottle(callback, 100));

        result.current(1);
        jest.advanceTimersByTime(101);
        result.current(2);

        expect(callback.mock.calls).toEqual([[1], [2]]);
    });

    test("forwards every argument", () => {
        const callback = mock((..._args: unknown[]) => {});
        const { result } = renderHook(() => useThrottle(callback, 100));

        result.current("a", 2, { three: 3 });

        expect(callback).toHaveBeenCalledWith("a", 2, { three: 3 });
    });

    test("always calls the latest callback without resetting the throttle", () => {
        const first = mock((_value: number) => {});
        const second = mock((_value: number) => {});
        const { result, rerender } = renderHook(({ cb }) => useThrottle(cb, 100), { initialProps: { cb: first } });

        result.current(1);
        rerender({ cb: second });
        result.current(2);
        expect(second).not.toHaveBeenCalled();

        jest.advanceTimersByTime(101);
        result.current(3);

        expect(first.mock.calls).toEqual([[1]]);
        expect(second.mock.calls).toEqual([[3]]);
    });

    test("returns a stable function while the delay stays the same", () => {
        const { result, rerender } = renderHook(({ cb }) => useThrottle(cb, 100), { initialProps: { cb: () => {} } });
        const initial = result.current;

        rerender({ cb: () => {} });

        expect(result.current).toBe(initial);
    });

    test("returns a new throttled function when the delay changes", () => {
        const callback = mock(() => {});
        const { result, rerender } = renderHook(({ delay }) => useThrottle(callback, delay), { initialProps: { delay: 100 } });
        const initial = result.current;

        rerender({ delay: 200 });

        expect(result.current).not.toBe(initial);
    });

    test("uses the new delay after it changes", () => {
        const callback = mock(() => {});
        const { result, rerender } = renderHook(({ delay }) => useThrottle(callback, delay), { initialProps: { delay: 100 } });
        rerender({ delay: 1000 });

        result.current();
        jest.advanceTimersByTime(500);
        result.current();

        expect(callback).toHaveBeenCalledTimes(1);
    });

    test("keeps separate throttles for separate hook instances", () => {
        const callback = mock(() => {});
        const first = renderHook(() => useThrottle(callback, 100));
        const second = renderHook(() => useThrottle(callback, 100));

        first.result.current();
        second.result.current();

        expect(callback).toHaveBeenCalledTimes(2);
    });
});
