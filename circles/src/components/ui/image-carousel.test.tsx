import { describe, expect, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "jotai";
import ImageCarousel from "./image-carousel";
import { GalleryState, galleryState, media, renderWithGallery } from "@/test/gallery-test-utils";

const FALLBACK_IMAGE_URL = "/images/default-cover.png";

// Absolute urls are used throughout: happy-dom fires an error event for relative image urls, which
// would trip the component's own onError fallback and hide the url actually handed to the <img>.

const renderCarousel = (props: React.ComponentProps<typeof ImageCarousel>) =>
    renderWithGallery(<ImageCarousel {...props} />);

describe("ImageCarousel", () => {
    test("renders one image per media item using the media name as alt text", () => {
        renderCarousel({
            images: [media("Front garden", "https://cdn.test/a.png"), media("Back garden", "https://cdn.test/b.png")],
        });

        expect(screen.getByAltText("Front garden")).toHaveAttribute("src", "https://cdn.test/a.png");
        expect(screen.getByAltText("Back garden")).toHaveAttribute("src", "https://cdn.test/b.png");
    });

    test("numbers the alt text when a media item has no name", () => {
        renderCarousel({
            images: [media("", "https://cdn.test/a.png"), media("", "https://cdn.test/b.png")],
        });

        expect(screen.getByAltText("Image 1")).toBeInTheDocument();
        expect(screen.getByAltText("Image 2")).toBeInTheDocument();
    });

    test("falls back to the default cover when a media item has no url", () => {
        renderCarousel({ images: [media("No url", ""), media("Has url", "https://cdn.test/b.png")] });

        expect(screen.getByAltText("No url")).toHaveAttribute("src", FALLBACK_IMAGE_URL);
    });

    test("shows the default cover image when the image list is empty", () => {
        renderCarousel({ images: [] });

        const image = screen.getByAltText("Default image");
        expect(image).toHaveAttribute("src", FALLBACK_IMAGE_URL);
        expect(screen.queryAllByLabelText(/Go to slide/)).toHaveLength(0);
    });

    test("does not open the gallery when the placeholder for an empty list is clicked", async () => {
        renderCarousel({ images: [] });

        await userEvent.click(screen.getByAltText("Default image"));

        expect(galleryState()).toBe("closed");
    });

    test("renders a single image on its own without carousel controls", () => {
        renderCarousel({ images: [media("Solo", "https://cdn.test/solo.png")] });

        expect(screen.getByAltText("Solo")).toHaveAttribute("src", "https://cdn.test/solo.png");
        expect(screen.queryAllByRole("button")).toHaveLength(0);
        expect(screen.queryAllByLabelText(/Go to slide/)).toHaveLength(0);
    });

    test("opens the gallery at the first image when the single image is clicked", async () => {
        renderCarousel({ images: [media("Solo", "https://cdn.test/solo.png")] });

        await userEvent.click(screen.getByAltText("Solo"));

        expect(galleryState()).toBe("Solo@0");
    });

    test("marks the single image wrapper as clickable", () => {
        renderCarousel({ images: [media("Solo", "https://cdn.test/solo.png")] });

        expect(screen.getByAltText("Solo").parentElement).toHaveClass("cursor-pointer");
    });

    test("makes the single image wrapper inert when swiping is disabled", () => {
        renderCarousel({ images: [media("Solo", "https://cdn.test/solo.png")], disableSwipe: true });

        const wrapper = screen.getByAltText("Solo").parentElement;
        expect(wrapper).toHaveClass("pointer-events-none");
        expect(wrapper).not.toHaveClass("cursor-pointer");
    });

    test("opens the gallery at the clicked image with the whole list", async () => {
        renderCarousel({
            images: [media("A", "https://cdn.test/a.png"), media("B", "https://cdn.test/b.png"), media("C", "https://cdn.test/c.png")],
        });

        await userEvent.click(screen.getByAltText("C"));

        expect(galleryState()).toBe("A,B,C@2");
    });

    test("keeps the gallery closed until an image is clicked", () => {
        renderCarousel({ images: [media("A", "https://cdn.test/a.png"), media("B", "https://cdn.test/b.png")] });

        expect(galleryState()).toBe("closed");
    });

    test("makes the multi-image container inert when swiping is disabled", () => {
        const { container } = renderCarousel({
            images: [media("A", "https://cdn.test/a.png"), media("B", "https://cdn.test/b.png")],
            disableSwipe: true,
        });

        expect(container.querySelector(".embla")).toHaveClass("pointer-events-none");
    });

    test("leaves the multi-image container interactive by default", () => {
        const { container } = renderCarousel({
            images: [media("A", "https://cdn.test/a.png"), media("B", "https://cdn.test/b.png")],
        });

        expect(container.querySelector(".embla")).not.toHaveClass("pointer-events-none");
    });

    test("renders a dot per image and marks the first one as current", () => {
        renderCarousel({
            images: [media("A", "https://cdn.test/a.png"), media("B", "https://cdn.test/b.png"), media("C", "https://cdn.test/c.png")],
        });

        const dots = screen.getAllByLabelText(/Go to slide/);
        expect(dots).toHaveLength(3);
        expect(dots[0]).toHaveClass("bg-white");
        expect(dots[1]).toHaveClass("bg-white/40");
    });

    test("moves the current dot when another dot is clicked", async () => {
        renderCarousel({
            images: [media("A", "https://cdn.test/a.png"), media("B", "https://cdn.test/b.png"), media("C", "https://cdn.test/c.png")],
        });

        await userEvent.click(screen.getByLabelText("Go to slide 3"));

        expect(screen.getByLabelText("Go to slide 3")).toHaveClass("bg-white");
        expect(screen.getByLabelText("Go to slide 1")).toHaveClass("bg-white/40");
    });

    test("hides the dots when showDots is turned off", () => {
        renderCarousel({
            images: [media("A", "https://cdn.test/a.png"), media("B", "https://cdn.test/b.png")],
            showDots: false,
        });

        expect(screen.queryAllByLabelText(/Go to slide/)).toHaveLength(0);
    });

    test("pushes the dots to the right edge by default", () => {
        const { container } = renderCarousel({
            images: [media("A", "https://cdn.test/a.png"), media("B", "https://cdn.test/b.png")],
        });

        expect(screen.getByLabelText("Go to slide 1").closest(".absolute")).toHaveClass("justify-end", "pr-4");
        expect(container.querySelector(".justify-center")).toBeNull();
    });

    test("centers the dots when dotsPosition is bottom-center", () => {
        renderCarousel({
            images: [media("A", "https://cdn.test/a.png"), media("B", "https://cdn.test/b.png")],
            dotsPosition: "bottom-center",
        });

        const dotsRow = screen.getByLabelText("Go to slide 1").closest(".absolute");
        expect(dotsRow).toHaveClass("justify-center");
        expect(dotsRow).not.toHaveClass("justify-end");
    });

    test("hides the arrows unless showArrows is set", () => {
        renderCarousel({
            images: [media("A", "https://cdn.test/a.png"), media("B", "https://cdn.test/b.png")],
        });

        expect(screen.queryByRole("button", { name: "Previous slide" })).toBeNull();
        expect(screen.queryByRole("button", { name: "Next slide" })).toBeNull();
    });

    test("shows enabled arrows when showArrows is set because the carousel loops", () => {
        renderCarousel({
            images: [media("A", "https://cdn.test/a.png"), media("B", "https://cdn.test/b.png")],
            showArrows: true,
        });

        expect(screen.getByRole("button", { name: "Previous slide" })).toBeEnabled();
        expect(screen.getByRole("button", { name: "Next slide" })).toBeEnabled();
    });

    test("advances the current dot when the next arrow is clicked", async () => {
        renderCarousel({
            images: [media("A", "https://cdn.test/a.png"), media("B", "https://cdn.test/b.png"), media("C", "https://cdn.test/c.png")],
            showArrows: true,
        });

        await userEvent.click(screen.getByRole("button", { name: "Next slide" }));

        expect(screen.getByLabelText("Go to slide 2")).toHaveClass("bg-white");
    });

    test("wraps back to the last image when the previous arrow is clicked on the first one", async () => {
        renderCarousel({
            images: [media("A", "https://cdn.test/a.png"), media("B", "https://cdn.test/b.png"), media("C", "https://cdn.test/c.png")],
            showArrows: true,
        });

        await userEvent.click(screen.getByRole("button", { name: "Previous slide" }));

        expect(screen.getByLabelText("Go to slide 3")).toHaveClass("bg-white");
    });

    test("does not open the gallery when an arrow is clicked", async () => {
        renderCarousel({
            images: [media("A", "https://cdn.test/a.png"), media("B", "https://cdn.test/b.png")],
            showArrows: true,
        });

        await userEvent.click(screen.getByRole("button", { name: "Next slide" }));

        expect(galleryState()).toBe("closed");
    });

    test("swaps in the default cover when an image fails to load", () => {
        renderCarousel({ images: [media("A", "https://cdn.test/a.png"), media("B", "https://cdn.test/b.png")] });

        fireEvent.error(screen.getByAltText("A"));

        expect(screen.getByAltText("A")).toHaveAttribute("src", FALLBACK_IMAGE_URL);
        expect(screen.getByAltText("B")).toHaveAttribute("src", "https://cdn.test/b.png");
    });

    test("keeps the default cover after a second load failure instead of resetting it", () => {
        renderCarousel({ images: [media("A", "https://cdn.test/a.png"), media("B", "https://cdn.test/b.png")] });
        const image = screen.getByAltText("A");

        fireEvent.error(image);
        fireEvent.error(image);

        expect(image).toHaveAttribute("src", FALLBACK_IMAGE_URL);
    });

    test("swaps in the default cover when the single image fails to load", () => {
        renderCarousel({ images: [media("Solo", "https://cdn.test/solo.png")] });

        fireEvent.error(screen.getByAltText("Solo"));

        expect(screen.getByAltText("Solo")).toHaveAttribute("src", FALLBACK_IMAGE_URL);
    });

    test("applies the container and image classes", () => {
        const { container } = renderCarousel({
            images: [media("A", "https://cdn.test/a.png"), media("B", "https://cdn.test/b.png")],
            containerClassName: "container-marker",
            imageClassName: "image-marker",
        });

        expect(container.querySelector(".embla")).toHaveClass("container-marker", "relative", "overflow-hidden");
        expect(screen.getByAltText("A")).toHaveClass("image-marker", "object-cover");
    });

    test("applies the container and image classes to a single image", () => {
        renderCarousel({
            images: [media("Solo", "https://cdn.test/solo.png")],
            containerClassName: "container-marker",
            imageClassName: "image-marker",
        });

        expect(screen.getByAltText("Solo").parentElement).toHaveClass("container-marker");
        expect(screen.getByAltText("Solo")).toHaveClass("image-marker");
    });

    test("applies the container and image classes to the empty placeholder", () => {
        renderCarousel({ images: [], containerClassName: "container-marker", imageClassName: "image-marker" });

        expect(screen.getByAltText("Default image").parentElement).toHaveClass("container-marker");
        expect(screen.getByAltText("Default image")).toHaveClass("image-marker");
    });

    test("keeps the gallery scoped to its own jotai provider", async () => {
        render(
            <>
                <Provider>
                    <ImageCarousel images={[media("Shared", "https://cdn.test/shared.png")]} />
                </Provider>
                <Provider>
                    <GalleryState />
                </Provider>
            </>,
        );

        await userEvent.click(screen.getByAltText("Shared"));

        expect(galleryState()).toBe("closed");
    });

    test("removes every image from the document on unmount", () => {
        const { unmount } = renderCarousel({
            images: [media("A", "https://cdn.test/a.png"), media("B", "https://cdn.test/b.png")],
        });
        expect(screen.getByAltText("A")).toBeInTheDocument();

        unmount();

        expect(screen.queryByAltText("A")).toBeNull();
        expect(screen.queryAllByLabelText(/Go to slide/)).toHaveLength(0);
    });
});
