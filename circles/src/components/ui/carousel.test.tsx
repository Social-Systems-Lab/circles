import { describe, expect, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious, type CarouselApi } from "./carousel";

// embla measures slide widths from layout, and happy-dom reports every box as 0x0. That means
// scrollSnapList() stays empty, canScrollPrev()/canScrollNext() stay false and scrollTo() is a no-op,
// so the previous/next buttons can never become enabled here. The tests below cover the parts that
// are observable without layout: composition, aria wiring, orientation classes and key handling.
const renderCarousel = (props: Partial<React.ComponentProps<typeof Carousel>> = {}) =>
    render(
        <Carousel {...props}>
            <CarouselContent>
                <CarouselItem>First slide</CarouselItem>
                <CarouselItem>Second slide</CarouselItem>
                <CarouselItem>Third slide</CarouselItem>
            </CarouselContent>
            <CarouselPrevious />
            <CarouselNext />
        </Carousel>,
    );

describe("Carousel", () => {
    test("renders a region that announces itself as a carousel", () => {
        renderCarousel();

        const region = screen.getByRole("region");
        expect(region).toHaveAttribute("aria-roledescription", "carousel");
        expect(region).toHaveClass("relative");
    });

    test("renders every child as a slide group", () => {
        renderCarousel();

        const slides = screen.getAllByRole("group");
        expect(slides).toHaveLength(3);
        expect(slides.map((slide) => slide.textContent)).toEqual(["First slide", "Second slide", "Third slide"]);
        expect(slides[0]).toHaveAttribute("aria-roledescription", "slide");
    });

    test("renders an empty carousel with no slides", () => {
        render(
            <Carousel>
                <CarouselContent />
            </Carousel>,
        );

        expect(screen.getByRole("region")).toBeInTheDocument();
        expect(screen.queryAllByRole("group")).toHaveLength(0);
    });

    test("labels the navigation buttons for screen readers only", () => {
        renderCarousel();

        expect(screen.getByRole("button", { name: "Previous slide" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Next slide" })).toBeInTheDocument();
        expect(screen.getByText("Previous slide")).toHaveClass("sr-only");
    });

    test("lays the slides out horizontally by default", () => {
        render(
            <Carousel>
                <CarouselContent className="content-marker">
                    <CarouselItem className="item-marker">Only slide</CarouselItem>
                </CarouselContent>
            </Carousel>,
        );

        expect(document.querySelector(".content-marker")).toHaveClass("flex", "-ml-4");
        expect(document.querySelector(".content-marker")).not.toHaveClass("flex-col");
        expect(document.querySelector(".item-marker")).toHaveClass("basis-full", "pl-4");
    });

    test("stacks the slides vertically when the orientation is vertical", () => {
        render(
            <Carousel orientation="vertical">
                <CarouselContent className="content-marker">
                    <CarouselItem className="item-marker">Only slide</CarouselItem>
                </CarouselContent>
            </Carousel>,
        );

        expect(document.querySelector(".content-marker")).toHaveClass("flex", "-mt-4", "flex-col");
        expect(document.querySelector(".item-marker")).toHaveClass("basis-full", "pt-4");
    });

    test("positions the navigation buttons beside the carousel when horizontal", () => {
        renderCarousel();

        expect(screen.getByRole("button", { name: "Previous slide" })).toHaveClass("absolute", "-left-12", "top-1/2");
        expect(screen.getByRole("button", { name: "Next slide" })).toHaveClass("absolute", "-right-12", "top-1/2");
    });

    test("rotates the navigation buttons above and below the carousel when vertical", () => {
        renderCarousel({ orientation: "vertical" });

        expect(screen.getByRole("button", { name: "Previous slide" })).toHaveClass("-top-12", "rotate-90");
        expect(screen.getByRole("button", { name: "Next slide" })).toHaveClass("-bottom-12", "rotate-90");
    });

    test("styles the navigation buttons as outline icon buttons by default", () => {
        renderCarousel();

        expect(screen.getByRole("button", { name: "Previous slide" })).toHaveClass("border-input", "h-8", "w-8", "rounded-full");
    });

    test("lets the navigation buttons take a different button variant", () => {
        render(
            <Carousel>
                <CarouselContent>
                    <CarouselItem>Only slide</CarouselItem>
                </CarouselContent>
                <CarouselNext variant="ghost" className="next-marker" />
            </Carousel>,
        );

        const next = screen.getByRole("button", { name: "Next slide" });
        expect(next).toHaveClass("next-marker");
        expect(next).not.toHaveClass("border-input");
    });

    test("throws when the content is used outside a carousel", () => {
        expect(() => render(<CarouselContent />)).toThrow("useCarousel must be used within a <Carousel />");
    });

    test("throws when an item is used outside a carousel", () => {
        expect(() => render(<CarouselItem>Orphan</CarouselItem>)).toThrow("useCarousel must be used within a <Carousel />");
    });

    test("throws when the previous button is used outside a carousel", () => {
        expect(() => render(<CarouselPrevious />)).toThrow("useCarousel must be used within a <Carousel />");
    });

    test("throws when the next button is used outside a carousel", () => {
        expect(() => render(<CarouselNext />)).toThrow("useCarousel must be used within a <Carousel />");
    });

    test("hands the embla api to setApi", () => {
        let api: CarouselApi;
        renderCarousel({ setApi: (received) => (api = received) });

        expect(api!).toBeDefined();
        expect(typeof api!.scrollNext).toBe("function");
        expect(typeof api!.selectedScrollSnap).toBe("function");
    });

    test("starts on the first slide", () => {
        let api: CarouselApi;
        renderCarousel({ setApi: (received) => (api = received) });

        expect(api!.selectedScrollSnap()).toBe(0);
    });

    test("keeps both navigation buttons disabled because embla cannot measure slides in happy-dom", () => {
        let api: CarouselApi;
        renderCarousel({ setApi: (received) => (api = received) });

        expect(api!.canScrollPrev()).toBe(false);
        expect(api!.canScrollNext()).toBe(false);
        expect(screen.getByRole("button", { name: "Previous slide" })).toBeDisabled();
        expect(screen.getByRole("button", { name: "Next slide" })).toBeDisabled();
    });

    test("does not scroll when a disabled navigation button is clicked", async () => {
        let api: CarouselApi;
        renderCarousel({ setApi: (received) => (api = received) });

        await userEvent.click(screen.getByRole("button", { name: "Next slide" }), { pointerEventsCheck: 0 });

        expect(api!.selectedScrollSnap()).toBe(0);
    });

    test("handles the right arrow key itself instead of letting the page scroll", () => {
        renderCarousel();

        const handled = !fireEvent.keyDown(screen.getByRole("region"), { key: "ArrowRight" });

        expect(handled).toBe(true);
    });

    test("handles the left arrow key itself instead of letting the page scroll", () => {
        renderCarousel();

        const handled = !fireEvent.keyDown(screen.getByRole("region"), { key: "ArrowLeft" });

        expect(handled).toBe(true);
    });

    test("leaves other keys alone", () => {
        renderCarousel();

        const handled = !fireEvent.keyDown(screen.getByRole("region"), { key: "Enter" });

        expect(handled).toBe(false);
    });

    test("handles arrow keys pressed inside a slide because the handler captures them", () => {
        renderCarousel();

        const handled = !fireEvent.keyDown(screen.getAllByRole("group")[0], { key: "ArrowRight" });

        expect(handled).toBe(true);
    });

    test("passes the axis matching the orientation to embla", () => {
        let api: CarouselApi;
        renderCarousel({ orientation: "vertical", setApi: (received) => (api = received) });

        expect(api!.internalEngine().options.axis).toBe("y");
    });

    test("lets the caller override embla options", () => {
        let api: CarouselApi;
        renderCarousel({ opts: { loop: true }, setApi: (received) => (api = received) });

        expect(api!.internalEngine().options.loop).toBe(true);
    });

    test("merges a custom class into the region", () => {
        renderCarousel({ className: "carousel-marker" });

        expect(screen.getByRole("region")).toHaveClass("carousel-marker", "relative");
    });

    test("passes native attributes through to the region", () => {
        renderCarousel({ "aria-label": "Featured circles", id: "featured" } as React.ComponentProps<typeof Carousel>);

        const region = screen.getByRole("region", { name: "Featured circles" });
        expect(region).toHaveAttribute("id", "featured");
    });

    test("forwards a ref to the region element", () => {
        let captured: HTMLDivElement | null = null;
        render(
            <Carousel ref={(node) => (captured = node)}>
                <CarouselContent>
                    <CarouselItem>Only slide</CarouselItem>
                </CarouselContent>
            </Carousel>,
        );

        expect((captured as unknown as HTMLDivElement)?.getAttribute("aria-roledescription")).toBe("carousel");
    });

    test("wraps the slides in an overflow-hidden viewport", () => {
        renderCarousel();

        const viewport = screen.getByRole("region").firstElementChild;
        expect(viewport).toHaveClass("overflow-hidden");
        expect(viewport?.firstElementChild).toHaveClass("flex");
    });

    test("removes the carousel from the document on unmount", () => {
        const { unmount } = renderCarousel();
        expect(screen.getByRole("region")).toBeInTheDocument();

        unmount();

        expect(screen.queryByRole("region")).toBeNull();
        expect(screen.queryAllByRole("group")).toHaveLength(0);
    });
});
