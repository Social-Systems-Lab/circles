import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { ScrollArea, ScrollBar } from "./scroll-area";

const getViewport = (container: HTMLElement) =>
    container.querySelector("[data-radix-scroll-area-viewport]") as HTMLElement;

describe("ScrollArea", () => {
    test("renders its children inside the scrollable viewport", () => {
        const { container } = render(
            <ScrollArea>
                <p>Ada, Grace and Alan</p>
            </ScrollArea>,
        );

        expect(getViewport(container)).toContainElement(screen.getByText("Ada, Grace and Alan"));
    });

    test("clips overflow on the root element", () => {
        const { container } = render(
            <ScrollArea>
                <p>Ada, Grace and Alan</p>
            </ScrollArea>,
        );

        expect(container.firstElementChild).toHaveClass("relative", "overflow-hidden");
    });

    test("merges custom classes into the root element", () => {
        const { container } = render(
            <ScrollArea className="root-class h-40">
                <p>Ada, Grace and Alan</p>
            </ScrollArea>,
        );

        expect(container.firstElementChild).toHaveClass("root-class", "h-40", "relative");
    });

    test("lets the viewport fill the root", () => {
        const { container } = render(
            <ScrollArea>
                <p>Ada, Grace and Alan</p>
            </ScrollArea>,
        );

        expect(getViewport(container)).toHaveClass("h-full", "w-full");
    });

    test("forwards a ref to the root element", () => {
        let captured: HTMLElement | null = null;
        const { container } = render(
            <ScrollArea
                ref={(node) => {
                    captured = node;
                }}
            >
                <p>Ada, Grace and Alan</p>
            </ScrollArea>,
        );

        expect(captured).toBe(container.firstElementChild as never);
    });

    test("forwards viewportRef to the viewport element rather than the root", () => {
        let captured: HTMLDivElement | null = null;
        const { container } = render(
            <ScrollArea
                viewportRef={(node) => {
                    captured = node;
                }}
            >
                <p>Ada, Grace and Alan</p>
            </ScrollArea>,
        );

        expect(captured).toBe(getViewport(container) as never);
        expect(captured).not.toBe(container.firstElementChild as never);
    });

    test("does not leak viewportRef onto the root as a DOM attribute", () => {
        const { container } = render(
            <ScrollArea viewportRef={() => {}}>
                <p>Ada, Grace and Alan</p>
            </ScrollArea>,
        );

        expect(container.firstElementChild).not.toHaveAttribute("viewportRef");
        expect(container.firstElementChild).not.toHaveAttribute("viewportref");
    });

    test("passes native attributes through to the root element", () => {
        render(
            <ScrollArea data-testid="members-list" id="members" aria-label="Members">
                <p>Ada, Grace and Alan</p>
            </ScrollArea>,
        );

        const root = screen.getByTestId("members-list");
        expect(root).toHaveAttribute("id", "members");
        expect(root).toHaveAttribute("aria-label", "Members");
    });

    // The default `type="hover"` only mounts a scrollbar once Radix measures an overflow, which
    // never happens under happy-dom because every element reports a zero sized box.
    test("renders no scrollbar until an overflow is measured", () => {
        const { container } = render(
            <ScrollArea>
                <p>Ada, Grace and Alan</p>
            </ScrollArea>,
        );

        expect(container.querySelector("[data-orientation]")).toBeNull();
    });

    test("renders a vertical scrollbar when the type is always", () => {
        const { container } = render(
            <ScrollArea type="always">
                <p>Ada, Grace and Alan</p>
            </ScrollArea>,
        );

        const scrollbar = container.querySelector("[data-orientation]") as HTMLElement;
        expect(scrollbar).toHaveAttribute("data-orientation", "vertical");
        expect(scrollbar).toHaveClass("w-2.5", "h-full", "touch-none", "select-none");
    });

    test("uses the horizontal classes when the scrollbar is horizontal", () => {
        const { container } = render(
            <ScrollArea type="always">
                <p>Ada, Grace and Alan</p>
                <ScrollBar orientation="horizontal" />
            </ScrollArea>,
        );

        const horizontal = container.querySelector('[data-orientation="horizontal"]') as HTMLElement;
        expect(horizontal).toHaveClass("h-2.5", "flex-col", "border-t");
        expect(horizontal).not.toHaveClass("w-2.5");
    });

    test("merges custom classes into a scrollbar", () => {
        const { container } = render(
            <ScrollArea type="always">
                <p>Ada, Grace and Alan</p>
                <ScrollBar className="scrollbar-class" orientation="horizontal" />
            </ScrollArea>,
        );

        expect(container.querySelector('[data-orientation="horizontal"]')).toHaveClass(
            "scrollbar-class",
            "transition-colors",
        );
    });

    test("defaults a standalone scrollbar to the vertical orientation", () => {
        const { container } = render(
            <ScrollArea type="always">
                <p>Ada, Grace and Alan</p>
                <ScrollBar />
            </ScrollArea>,
        );

        expect(container.querySelectorAll('[data-orientation="vertical"]')).toHaveLength(2);
    });

    test("forwards a ref to the scrollbar element", () => {
        let captured: HTMLElement | null = null;
        const { container } = render(
            <ScrollArea type="always">
                <p>Ada, Grace and Alan</p>
                <ScrollBar
                    orientation="horizontal"
                    ref={(node) => {
                        captured = node;
                    }}
                />
            </ScrollArea>,
        );

        expect(captured).toBe(container.querySelector('[data-orientation="horizontal"]') as never);
    });

    test("throws when a scrollbar is rendered outside a ScrollArea", () => {
        expect(() => render(<ScrollBar />)).toThrow();
    });

    // The thumb only mounts once Radix has a non zero thumb size to report, so happy-dom leaves
    // the scrollbar empty. Thumb rendering is therefore not covered here.
    test("leaves the scrollbar without a thumb while nothing can be measured", () => {
        const { container } = render(
            <ScrollArea type="always">
                <p>Ada, Grace and Alan</p>
            </ScrollArea>,
        );

        expect(container.querySelector("[data-orientation]")).toBeEmptyDOMElement();
    });

    test("keeps the same viewport element across re-renders", () => {
        const { container, rerender } = render(
            <ScrollArea>
                <p>Ada, Grace and Alan</p>
            </ScrollArea>,
        );
        const before = getViewport(container);

        rerender(
            <ScrollArea>
                <p>Ada, Grace, Alan and Edsger</p>
            </ScrollArea>,
        );

        expect(getViewport(container)).toBe(before);
        expect(screen.getByText("Ada, Grace, Alan and Edsger")).toBeInTheDocument();
    });
});
