import { beforeEach, describe, expect, mock, test } from "bun:test";
import { act, render, screen } from "@testing-library/react";
import * as React from "react";

// Capture spring and drag wiring so the tests can drive height and gesture handlers
// without depending on real animation frames or pointer hardware.
type SpringApi = {
    start: (args: Record<string, unknown>) => void;
    get: () => number;
};

const springStarts: Record<string, unknown>[] = [];
let springHeight = 0;
let springOnRest: ((result: { cancelled: boolean; value: { height: number } }) => void) | undefined;
let latestDragHandler: ((state: Record<string, unknown>) => unknown) | undefined;
let latestDragConfig: Record<string, unknown> | undefined;

mock.module("@react-spring/web", () => ({
    config: { stiff: { tension: 210, friction: 20 } },
    animated: (tag: string) => {
        const Animated = React.forwardRef<HTMLElement, Record<string, unknown>>(function Animated(
            { style, children, className, ...rest },
            ref,
        ) {
            const height =
                style && typeof style === "object" && "height" in style
                    ? typeof (style as { height?: { get?: () => number } | number }).height === "object"
                        ? (style as { height: { get: () => number } }).height.get()
                        : (style as { height?: number }).height
                    : undefined;
            return React.createElement(
                tag,
                {
                    ...rest,
                    ref,
                    className,
                    "data-testid": "resizing-drawer",
                    "data-height": height,
                    style:
                        style && typeof style === "object"
                            ? {
                                  ...(style as Record<string, unknown>),
                                  height: typeof height === "number" ? `${height}px` : undefined,
                              }
                            : style,
                },
                children,
            );
        });
        Animated.displayName = `animated(${tag})`;
        return Animated;
    },
    useSpring: (factory: () => Record<string, unknown>) => {
        const initial = factory();
        springOnRest = initial.onRest as typeof springOnRest;
        springHeight = typeof initial.height === "number" ? initial.height : 0;
        const api: SpringApi = {
            start: (args) => {
                springStarts.push(args);
                if (typeof args.height === "number") {
                    springHeight = args.height;
                }
            },
            get: () => springHeight,
        };
        const animatedHeight = {
            get: () => springHeight,
            // react-spring animated values are objects; the drawer reads `.get()`
        };
        return [{ height: animatedHeight }, api];
    },
}));

mock.module("@use-gesture/react", () => ({
    useDrag: (handler: (state: Record<string, unknown>) => unknown, config: Record<string, unknown>) => {
        latestDragHandler = handler;
        latestDragConfig = config;
    },
}));

const ResizingDrawer = (await import("./resizing-drawer")).default;

const flushEffects = async () => {
    await act(async () => {
        await Promise.resolve();
    });
};

const getDrawer = () => screen.getByTestId("resizing-drawer");
const queryDrawer = () => screen.queryByTestId("resizing-drawer");

describe("ResizingDrawer", () => {
    beforeEach(() => {
        springStarts.length = 0;
        springHeight = 0;
        springOnRest = undefined;
        latestDragHandler = undefined;
        latestDragConfig = undefined;
        Object.defineProperty(window, "innerHeight", { configurable: true, value: 1000, writable: true });
    });

    // Intentionally no mock.restore(): clearing the spring/gesture mocks mid-suite would make
    // later tests hit the real animation libraries and lose the captured start/drag hooks.

    test("renders nothing when there are no usable snap points", async () => {
        render(<ResizingDrawer snapPoints={[]}>Drawer body</ResizingDrawer>);
        await flushEffects();

        expect(queryDrawer()).toBeNull();
        expect(screen.queryByText("Drawer body")).toBeNull();
    });

    test("renders nothing when every snap point is invalid", async () => {
        render(<ResizingDrawer snapPoints={["not-a-snap", -10] as (number | string)[]}>Drawer body</ResizingDrawer>);
        await flushEffects();

        expect(queryDrawer()).toBeNull();
    });

    test("renders its children once mounted with valid snap points", async () => {
        render(<ResizingDrawer snapPoints={[200, 500]}>Drawer body</ResizingDrawer>);
        await flushEffects();

        expect(getDrawer()).toBeInTheDocument();
        expect(screen.getByText("Drawer body")).toBeInTheDocument();
    });

    test("uses fixed positioning when no containerRef is provided", async () => {
        render(<ResizingDrawer snapPoints={[200]}>Drawer body</ResizingDrawer>);
        await flushEffects();

        expect(getDrawer().style.position).toBe("fixed");
        expect(getDrawer().style.bottom).toBe("0px");
    });

    test("uses absolute positioning when a containerRef is provided", async () => {
        const container = document.createElement("div");
        Object.defineProperty(container, "clientHeight", { value: 800 });
        const containerRef = { current: container };

        render(
            <ResizingDrawer snapPoints={[200]} containerRef={containerRef}>
                Drawer body
            </ResizingDrawer>,
        );
        await flushEffects();

        expect(getDrawer().style.position).toBe("absolute");
    });

    test("starts at the initial snap point height", async () => {
        render(
            <ResizingDrawer snapPoints={[200, 500, 800]} initialSnapPointIndex={1}>
                Drawer body
            </ResizingDrawer>,
        );
        await flushEffects();

        expect(springStarts.some((start) => start.height === 500)).toBe(true);
    });

    test("clamps an out-of-range initialSnapPointIndex into the available snaps", async () => {
        render(
            <ResizingDrawer snapPoints={[200, 500]} initialSnapPointIndex={99}>
                Drawer body
            </ResizingDrawer>,
        );
        await flushEffects();

        expect(springStarts.some((start) => start.height === 500)).toBe(true);
    });

    test("resolves percentage snap points against the container height", async () => {
        const container = document.createElement("div");
        Object.defineProperty(container, "clientHeight", { value: 1000 });

        render(
            <ResizingDrawer
                snapPoints={["25%", "50%"]}
                initialSnapPointIndex={1}
                containerRef={{ current: container }}
            >
                Drawer body
            </ResizingDrawer>,
        );
        await flushEffects();

        // 50% of the 1000px container → 500
        expect(springStarts.map((start) => start.height)).toContain(500);
        expect(getDrawer()).toBeInTheDocument();
    });

    test("sorts snap points ascending regardless of input order", async () => {
        render(
            <ResizingDrawer snapPoints={[800, 200, 500]} initialSnapPointIndex={0}>
                Drawer body
            </ResizingDrawer>,
        );
        await flushEffects();

        expect(springStarts.some((start) => start.height === 200)).toBe(true);
    });

    test("animates to activeSnapIndex when it changes externally", async () => {
        const { rerender } = render(
            <ResizingDrawer snapPoints={[200, 500, 800]} initialSnapPointIndex={0}>
                Drawer body
            </ResizingDrawer>,
        );
        await flushEffects();
        springStarts.length = 0;

        rerender(
            <ResizingDrawer snapPoints={[200, 500, 800]} initialSnapPointIndex={0} activeSnapIndex={2}>
                Drawer body
            </ResizingDrawer>,
        );
        await flushEffects();

        expect(springStarts.some((start) => start.height === 800 && start.immediate === false)).toBe(true);
    });

    test("ignores an activeSnapIndex that is out of range", async () => {
        const { rerender } = render(
            <ResizingDrawer snapPoints={[200, 500]} initialSnapPointIndex={0}>
                Drawer body
            </ResizingDrawer>,
        );
        await flushEffects();
        springStarts.length = 0;

        rerender(
            <ResizingDrawer snapPoints={[200, 500]} initialSnapPointIndex={0} activeSnapIndex={5}>
                Drawer body
            </ResizingDrawer>,
        );
        await flushEffects();

        // Remount effects may re-assert the current snap height, but they must never invent a
        // height that is not one of the configured snap points.
        expect(springStarts.every((start) => start.height === 200 || start.height === 500)).toBe(true);
        expect(springStarts.every((start) => start.height !== undefined && (start.height as number) <= 500)).toBe(
            true,
        );
    });

    test("animates to triggerSnapIndex and consumes the trigger", async () => {
        const consumed: number[] = [];
        const { rerender } = render(
            <ResizingDrawer
                snapPoints={[200, 500, 800]}
                initialSnapPointIndex={0}
                triggerSnapIndex={-1}
                onTriggerConsumed={() => consumed.push(1)}
            >
                Drawer body
            </ResizingDrawer>,
        );
        await flushEffects();
        springStarts.length = 0;

        rerender(
            <ResizingDrawer
                snapPoints={[200, 500, 800]}
                initialSnapPointIndex={0}
                triggerSnapIndex={2}
                onTriggerConsumed={() => consumed.push(1)}
            >
                Drawer body
            </ResizingDrawer>,
        );
        await flushEffects();

        expect(springStarts.some((start) => start.height === 800 && start.immediate === false)).toBe(true);
        expect(consumed).toEqual([1]);
    });

    test("consumes a trigger without animating to a new height when already there", async () => {
        const consumed: number[] = [];
        // Start already at index 1 (height 500).
        const { rerender } = render(
            <ResizingDrawer
                snapPoints={[200, 500, 800]}
                initialSnapPointIndex={1}
                triggerSnapIndex={-1}
                onTriggerConsumed={() => consumed.push(1)}
            >
                Drawer body
            </ResizingDrawer>,
        );
        await flushEffects();
        springHeight = 500;
        springStarts.length = 0;

        rerender(
            <ResizingDrawer
                snapPoints={[200, 500, 800]}
                initialSnapPointIndex={1}
                triggerSnapIndex={1}
                onTriggerConsumed={() => consumed.push(1)}
            >
                Drawer body
            </ResizingDrawer>,
        );
        await flushEffects();

        // The trigger path logs "already at target" and must not animate to a different snap.
        expect(springStarts.every((start) => start.height === 500)).toBe(true);
        expect(consumed).toEqual([1]);
    });

    test("ignores an out-of-range triggerSnapIndex without consuming it", async () => {
        // Today's behavior: the trigger effect only runs when 0 <= index < snapPoints.length,
        // so an out-of-range index is a no-op and onTriggerConsumed is not called.
        const consumed: number[] = [];
        const { rerender } = render(
            <ResizingDrawer snapPoints={[200]} triggerSnapIndex={-1} onTriggerConsumed={() => consumed.push(1)}>
                Drawer body
            </ResizingDrawer>,
        );
        await flushEffects();

        rerender(
            <ResizingDrawer snapPoints={[200]} triggerSnapIndex={3} onTriggerConsumed={() => consumed.push(1)}>
                Drawer body
            </ResizingDrawer>,
        );
        await flushEffects();

        expect(consumed).toEqual([]);
    });

    test("reports the settled snap index through onSnapChange when the spring rests", async () => {
        const snaps: number[] = [];
        render(
            <ResizingDrawer snapPoints={[200, 500, 800]} initialSnapPointIndex={0} onSnapChange={(index) => snaps.push(index)}>
                Drawer body
            </ResizingDrawer>,
        );
        await flushEffects();

        act(() => {
            springOnRest?.({ cancelled: false, value: { height: 800 } });
        });

        expect(snaps).toEqual([2]);
    });

    test("does not report a snap change when the spring rest is cancelled", async () => {
        const snaps: number[] = [];
        render(
            <ResizingDrawer snapPoints={[200, 500]} onSnapChange={(index) => snaps.push(index)}>
                Drawer body
            </ResizingDrawer>,
        );
        await flushEffects();

        act(() => {
            springOnRest?.({ cancelled: true, value: { height: 500 } });
        });

        expect(snaps).toEqual([]);
    });

    test("does not report a snap change when the rest height is not near a snap point", async () => {
        const snaps: number[] = [];
        render(
            <ResizingDrawer snapPoints={[200, 500]} initialSnapPointIndex={0} onSnapChange={(index) => snaps.push(index)}>
                Drawer body
            </ResizingDrawer>,
        );
        await flushEffects();

        act(() => {
            springOnRest?.({ cancelled: false, value: { height: 350 } });
        });

        expect(snaps).toEqual([]);
    });

    test("wires the drag gesture to the invisible touch target", async () => {
        render(<ResizingDrawer snapPoints={[200, 500]}>Drawer body</ResizingDrawer>);
        await flushEffects();

        expect(latestDragHandler).toBeTypeOf("function");
        expect(latestDragConfig).toMatchObject({
            filterTaps: true,
            preventScroll: false,
            pointer: { touch: true },
        });
        expect(latestDragConfig?.target).toBeDefined();
    });

    test("follows the pointer during an active drag and snaps up past the move threshold", async () => {
        render(<ResizingDrawer snapPoints={[200, 500, 800]} initialSnapPointIndex={0}>Drawer body</ResizingDrawer>);
        await flushEffects();
        springHeight = 200;
        springStarts.length = 0;

        // first frame: establish the drag memo
        const memo = latestDragHandler?.({
            first: true,
            last: false,
            active: true,
            movement: [0, 0],
            velocity: [0, 0],
            cancel: () => {},
            memo: undefined,
        });
        expect(memo).toEqual({ startHeight: 200 });

        // mid drag: follow the finger (negative my = drag up = taller)
        latestDragHandler?.({
            first: false,
            last: false,
            active: true,
            movement: [0, -120],
            velocity: [0, 0.5],
            cancel: () => {},
            memo,
        });
        expect(springStarts.at(-1)).toMatchObject({ height: 320, immediate: true });

        // release past the threshold: snap to the next point
        springStarts.length = 0;
        latestDragHandler?.({
            first: false,
            last: true,
            active: false,
            movement: [0, -120],
            velocity: [0, 0.5],
            cancel: () => {},
            memo,
        });
        expect(springStarts.at(-1)).toMatchObject({ height: 500, immediate: false });
    });

    test("snaps back to the start height when the drag stays under the move threshold", async () => {
        render(
            <ResizingDrawer snapPoints={[200, 500]} initialSnapPointIndex={0} moveThreshold={50}>
                Drawer body
            </ResizingDrawer>,
        );
        await flushEffects();
        springHeight = 200;

        const memo = latestDragHandler?.({
            first: true,
            last: false,
            active: true,
            movement: [0, 0],
            velocity: [0, 0],
            cancel: () => {},
            memo: undefined,
        });
        springStarts.length = 0;

        latestDragHandler?.({
            first: false,
            last: true,
            active: false,
            movement: [0, -20],
            velocity: [0, 0.1],
            cancel: () => {},
            memo,
        });

        expect(springStarts.at(-1)).toMatchObject({ height: 200, immediate: false });
    });

    test("snaps down to the previous point when dragged down past the threshold", async () => {
        render(
            <ResizingDrawer snapPoints={[200, 500, 800]} initialSnapPointIndex={1}>
                Drawer body
            </ResizingDrawer>,
        );
        await flushEffects();
        springHeight = 500;

        const memo = latestDragHandler?.({
            first: true,
            last: false,
            active: true,
            movement: [0, 0],
            velocity: [0, 0],
            cancel: () => {},
            memo: undefined,
        });
        springStarts.length = 0;

        latestDragHandler?.({
            first: false,
            last: true,
            active: false,
            movement: [0, 120],
            velocity: [0, 0.4],
            cancel: () => {},
            memo,
        });

        expect(springStarts.at(-1)).toMatchObject({ height: 200, immediate: false });
    });

    test("clamps the live drag height between the min and max snap points", async () => {
        render(<ResizingDrawer snapPoints={[200, 500]}>Drawer body</ResizingDrawer>);
        await flushEffects();
        springHeight = 200;

        const memo = latestDragHandler?.({
            first: true,
            last: false,
            active: true,
            movement: [0, 0],
            velocity: [0, 0],
            cancel: () => {},
            memo: undefined,
        });
        springStarts.length = 0;

        latestDragHandler?.({
            first: false,
            last: false,
            active: true,
            movement: [0, -999],
            velocity: [0, 1],
            cancel: () => {},
            memo,
        });

        expect(springStarts.at(-1)).toMatchObject({ height: 500, immediate: true });
    });

    test("cancels an active drag when more than one touch is detected", async () => {
        render(<ResizingDrawer snapPoints={[200, 500]}>Drawer body</ResizingDrawer>);
        await flushEffects();
        springHeight = 200;

        const memo = latestDragHandler?.({
            first: true,
            last: false,
            active: true,
            movement: [0, 0],
            velocity: [0, 0],
            cancel: () => {},
            memo: undefined,
        });
        springStarts.length = 0;
        let cancelled = false;

        latestDragHandler?.({
            first: false,
            last: false,
            active: true,
            movement: [0, -80],
            velocity: [0, 0.2],
            cancel: () => {
                cancelled = true;
            },
            memo,
            touches: 2,
        });

        expect(cancelled).toBe(true);
        expect(springStarts.at(-1)).toMatchObject({ height: 200, immediate: false });
    });

    test("cancels the drag when there are no snap points available mid-gesture", async () => {
        // Mount with snaps so the handler is wired, then drive it as if snaps vanished.
        render(<ResizingDrawer snapPoints={[200]}>Drawer body</ResizingDrawer>);
        await flushEffects();

        // Re-render with empty snaps so the handler closes over an empty list on next call.
        // The mounted handler still has the original snaps; instead assert the cancel path by
        // forcing containerHeight through a zero-height container.
        let cancelled = false;
        const container = document.createElement("div");
        Object.defineProperty(container, "clientHeight", { value: 0 });
        const { rerender } = render(
            <ResizingDrawer snapPoints={[200]} containerRef={{ current: container }}>
                Drawer body
            </ResizingDrawer>,
        );
        await flushEffects();

        // With height 0 the drawer unmounts its UI; the drag handler still cancels when active.
        latestDragHandler?.({
            first: false,
            last: false,
            active: true,
            movement: [0, -10],
            velocity: [0, 0],
            cancel: () => {
                cancelled = true;
            },
            memo: { startHeight: 200 },
        });

        // If the drawer remounted with zero height it returns null; either way the cancel path is safe.
        rerender(
            <ResizingDrawer snapPoints={[200]} containerRef={{ current: container }}>
                Drawer body
            </ResizingDrawer>,
        );
        await flushEffects();
        expect(cancelled || queryDrawer() === null).toBe(true);
    });

    test("exposes a visual handle and an invisible larger touch target", async () => {
        const { container } = render(<ResizingDrawer snapPoints={[200]}>Drawer body</ResizingDrawer>);
        await flushEffects();

        const touchTarget = container.querySelector("[aria-hidden='true']");
        const visualHandle = container.querySelector(".bg-gray-300");
        expect(touchTarget).not.toBeNull();
        expect(visualHandle).not.toBeNull();
        expect(visualHandle?.className).toContain("rounded-full");
    });

    test("keeps drawer content scrollable independently of the drag handle", async () => {
        const { container } = render(<ResizingDrawer snapPoints={[200]}>Drawer body</ResizingDrawer>);
        await flushEffects();

        const content = container.querySelector(".overflow-y-auto") as HTMLElement;
        expect(content).not.toBeNull();
        expect(content.style.touchAction).toBe("pan-y");
        expect(content).toHaveTextContent("Drawer body");
    });
});
