import { describe, expect, mock, test } from "bun:test";
import { render } from "@testing-library/react";
import * as React from "react";
import * as framerMotion from "framer-motion";

type MotionRender = { tag: string; animate: unknown; transition: unknown };
type MotionStubProps = React.HTMLAttributes<HTMLElement> & { animate?: unknown; transition?: unknown };

const motionRenders: MotionRender[] = [];

// framer-motion does render in happy-dom, but it hands these rotations to the Web Animations
// API, and cancelling such an animation on unmount makes happy-dom reject the animation's
// "finished" promise, which bun reports as an unhandled AbortError and fails the whole run.
// This stub renders the same element with the same className and style while recording the
// animation configuration, so the component's own output stays observable.
mock.module("framer-motion", () => ({
    ...framerMotion,
    motion: new Proxy({} as Record<string, React.FC<MotionStubProps>>, {
        get: (_target, property) => {
            const tag = String(property);
            const MotionStub = ({ animate, transition, children, ...rest }: MotionStubProps) => {
                motionRenders.push({ tag, animate, transition });
                return React.createElement(tag, rest, children);
            };

            return MotionStub;
        },
    }),
}));

const { LoadingSpinner } = await import("./loading-spinner");

const renderSpinner = () => {
    motionRenders.length = 0;
    const { container } = render(<LoadingSpinner />);
    const wrapper = container.firstElementChild as HTMLElement;
    const stack = wrapper.firstElementChild as HTMLElement;

    return { container, wrapper, stack, layers: Array.from(stack.children) as HTMLElement[] };
};

describe("LoadingSpinner", () => {
    test("centres the spinner inside the space it is given", () => {
        const { wrapper } = renderSpinner();

        expect(wrapper).toHaveClass("flex", "h-full", "w-full", "items-center", "justify-center");
    });

    test("stacks the rings and the dot in a relatively positioned container", () => {
        const { stack } = renderSpinner();

        expect(stack).toHaveClass("relative", "flex", "items-center", "justify-center");
    });

    test("renders three animated layers", () => {
        const { layers } = renderSpinner();

        expect(layers).toHaveLength(3);
        expect(motionRenders.map((entry) => entry.tag)).toEqual(["div", "div", "div"]);
    });

    test("draws the outer ring largest with the amber-400 border at low opacity", () => {
        const [outer] = renderSpinner().layers;

        expect(outer).toHaveClass("absolute", "h-16", "w-16", "rounded-full", "border-4");
        expect(outer.style.borderTopColor).toBe("#FBBF24");
        expect(outer.style.borderBottomColor).toBe("#FBBF24");
        expect(outer.style.opacity).toBe("0.4");
    });

    test("draws the middle ring smaller with the amber-500 border at higher opacity", () => {
        const [, middle] = renderSpinner().layers;

        expect(middle).toHaveClass("absolute", "h-12", "w-12", "rounded-full", "border-4");
        expect(middle.style.borderTopColor).toBe("#F59E0B");
        expect(middle.style.borderBottomColor).toBe("#F59E0B");
        expect(middle.style.opacity).toBe("0.6");
    });

    test("fills the inner dot with amber-600 and leaves it in the layout flow", () => {
        const [, , dot] = renderSpinner().layers;

        expect(dot).toHaveClass("h-4", "w-4", "rounded-full");
        expect(dot).not.toHaveClass("absolute");
        expect(dot.style.backgroundColor).toBe("#D97706");
    });

    test("leaves the left and right ring borders transparent so only an arc is visible", () => {
        const [outer, middle] = renderSpinner().layers;

        expect(outer).toHaveClass("border-l-transparent", "border-r-transparent");
        expect(middle).toHaveClass("border-l-transparent", "border-r-transparent");
    });

    test("spins the outer ring clockwise for ever", () => {
        renderSpinner();

        expect(motionRenders[0].animate).toEqual({ rotate: 360 });
        expect(motionRenders[0].transition).toEqual({ duration: 2, ease: "linear", repeat: Infinity });
    });

    test("spins the middle ring the other way and more slowly", () => {
        renderSpinner();

        expect(motionRenders[1].animate).toEqual({ rotate: -360 });
        expect(motionRenders[1].transition).toEqual({ duration: 3, ease: "linear", repeat: Infinity });
    });

    test("pulses the inner dot between its scale and opacity keyframes", () => {
        renderSpinner();

        expect(motionRenders[2].animate).toEqual({ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] });
        expect(motionRenders[2].transition).toEqual({ duration: 1.5, ease: "easeInOut", repeat: Infinity });
    });

    test("renders no text content", () => {
        const { container } = renderSpinner();

        expect(container.textContent).toBe("");
    });

    test("exposes nothing to assistive technology, so the loading state is not announced", () => {
        const { container } = renderSpinner();

        expect(container.querySelectorAll("[role]")).toHaveLength(0);
        expect(container.querySelectorAll("[aria-label], [aria-live], [aria-busy]")).toHaveLength(0);
    });

    test("renders its own layers for every instance on the page", () => {
        const { container } = render(
            <div>
                <LoadingSpinner />
                <LoadingSpinner />
            </div>,
        );

        expect(container.querySelectorAll(".rounded-full")).toHaveLength(6);
    });
});
