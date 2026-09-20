import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "jotai";
import { mockNextImage } from "@/test/next-image-mock";
import { GalleryState, galleryState, media, renderWithGallery } from "@/test/gallery-test-utils";

// next/image must be mocked before the component module is loaded.
mockNextImage();
const ImageThumbnailCarousel = (await import("./image-thumbnail-carousel")).default;

const DEFAULT_THUMBNAIL_URL = "/images/default-post-picture.png";

const renderThumbnails = (props: React.ComponentProps<typeof ImageThumbnailCarousel>) =>
    renderWithGallery(<ImageThumbnailCarousel {...props} />);

describe("ImageThumbnailCarousel", () => {
    test("renders a thumbnail per image using the media name as alt text", () => {
        renderThumbnails({ images: [media("Front garden", "https://cdn.test/a.png"), media("Back garden", "https://cdn.test/b.png")] });

        expect(screen.getByAltText("Front garden")).toHaveAttribute("src", "https://cdn.test/a.png");
        expect(screen.getByAltText("Back garden")).toHaveAttribute("src", "https://cdn.test/b.png");
    });

    test("renders nothing when the image list is empty", () => {
        const { container } = renderThumbnails({ images: [] });

        expect(container.querySelector(".embla")).toBeNull();
        expect(screen.queryAllByRole("img")).toHaveLength(0);
    });

    test("throws when the image list is missing instead of taking its own empty-list guard", () => {
        // The embla options read images.length while the hook is set up, which runs before the
        // `if (!images || images.length === 0) return null` guard further down the component.
        expect(() => renderThumbnails({ images: undefined as unknown as Media[] })).toThrow(/images\.length/);
    });

    test("renders a single thumbnail on its own", () => {
        renderThumbnails({ images: [media("Solo", "https://cdn.test/solo.png")] });

        expect(screen.getAllByRole("img")).toHaveLength(1);
        expect(screen.getByAltText("Solo")).toBeInTheDocument();
    });

    test("numbers the alt text when a media item has no name", () => {
        renderThumbnails({ images: [media("", "https://cdn.test/a.png"), media("", "https://cdn.test/b.png")] });

        expect(screen.getByAltText("Proposal image 1")).toBeInTheDocument();
        expect(screen.getByAltText("Proposal image 2")).toBeInTheDocument();
    });

    test("falls back to the default post picture when a media item has no file info", () => {
        renderThumbnails({
            images: [{ name: "No file info", type: "image/png" } as unknown as Media, media("Has url", "https://cdn.test/b.png")],
        });

        expect(screen.getByAltText("No file info")).toHaveAttribute("src", DEFAULT_THUMBNAIL_URL);
        expect(screen.getByAltText("Has url")).toHaveAttribute("src", "https://cdn.test/b.png");
    });

    test("keeps the gallery closed until a thumbnail is clicked", () => {
        renderThumbnails({ images: [media("A", "https://cdn.test/a.png"), media("B", "https://cdn.test/b.png")] });

        expect(galleryState()).toBe("closed");
    });

    test("opens the gallery at the clicked thumbnail with the whole list", async () => {
        renderThumbnails({
            images: [media("A", "https://cdn.test/a.png"), media("B", "https://cdn.test/b.png"), media("C", "https://cdn.test/c.png")],
        });

        await userEvent.click(screen.getByAltText("C"));

        expect(galleryState()).toBe("A,B,C@2");
    });

    test("opens the gallery at the first thumbnail", async () => {
        renderThumbnails({ images: [media("A", "https://cdn.test/a.png"), media("B", "https://cdn.test/b.png")] });

        await userEvent.click(screen.getByAltText("A"));

        expect(galleryState()).toBe("A,B@0");
    });

    test("reopens the gallery at the newly clicked thumbnail", async () => {
        renderThumbnails({ images: [media("A", "https://cdn.test/a.png"), media("B", "https://cdn.test/b.png")] });

        await userEvent.click(screen.getByAltText("A"));
        await userEvent.click(screen.getByAltText("B"));

        expect(galleryState()).toBe("A,B@1");
    });

    test("keeps the gallery scoped to its own jotai provider", async () => {
        render(
            <>
                <Provider>
                    <ImageThumbnailCarousel images={[media("Shared", "https://cdn.test/shared.png")]} />
                </Provider>
                <Provider>
                    <GalleryState />
                </Provider>
            </>,
        );

        await userEvent.click(screen.getByAltText("Shared"));

        expect(galleryState()).toBe("closed");
    });

    test("merges a custom class into the embla wrapper", () => {
        const { container } = renderThumbnails({
            images: [media("A", "https://cdn.test/a.png")],
            className: "thumbnails-marker",
        });

        expect(container.querySelector(".embla")).toHaveClass("thumbnails-marker", "overflow-hidden");
    });

    test("renders without a custom class", () => {
        const { container } = renderThumbnails({ images: [media("A", "https://cdn.test/a.png")] });

        expect(container.querySelector(".embla")).toHaveClass("overflow-hidden");
    });

    test("marks the slide track as draggable", () => {
        const { container } = renderThumbnails({ images: [media("A", "https://cdn.test/a.png")] });

        expect(container.querySelector(".embla__container")).toHaveClass("flex", "cursor-grab");
    });

    test("asks next/image to fill its sized container for every thumbnail", () => {
        renderThumbnails({ images: [media("A", "https://cdn.test/a.png"), media("B", "https://cdn.test/b.png")] });

        for (const image of screen.getAllByRole("img")) {
            expect(image).toHaveAttribute("data-fill", "true");
            expect(image).toHaveAttribute("data-sizes", "(max-width: 768px) 30vw, 20vw");
        }
    });

    test("gives each thumbnail a fixed aspect ratio frame", () => {
        renderThumbnails({ images: [media("A", "https://cdn.test/a.png")] });

        expect(screen.getByAltText("A").parentElement).toHaveClass("aspect-video", "overflow-hidden", "rounded-md");
    });

    test("styles the thumbnails as clickable", () => {
        renderThumbnails({ images: [media("A", "https://cdn.test/a.png")] });

        expect(screen.getByAltText("A")).toHaveClass("cursor-pointer", "object-cover");
    });

    test("removes every thumbnail from the document on unmount", () => {
        const { unmount } = renderThumbnails({
            images: [media("A", "https://cdn.test/a.png"), media("B", "https://cdn.test/b.png")],
        });
        expect(screen.getAllByRole("img")).toHaveLength(2);

        unmount();

        expect(screen.queryAllByRole("img")).toHaveLength(0);
    });
});
