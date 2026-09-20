import { render, screen } from "@testing-library/react";
import { Provider, useAtomValue } from "jotai";
import { imageGalleryAtom } from "@/lib/data/atoms";
import type { Media } from "@/models/models";

/** Build a Media fixture with the fields the image carousels actually read. */
export const media = (name: string, url: string): Media => ({
    name,
    type: "image/png",
    fileInfo: { url },
});

/**
 * Reads imageGalleryAtom so a test can assert gallery open/close without reaching into jotai
 * internals. Rendered next to the component under a fresh Provider.
 */
export const GalleryState = () => {
    const gallery = useAtomValue(imageGalleryAtom);
    return (
        <span data-testid="gallery-state">
            {gallery ? `${gallery.images.map((image) => image.name).join(",")}@${gallery.initialIndex}` : "closed"}
        </span>
    );
};

export const galleryState = (): string | null => screen.getByTestId("gallery-state").textContent;

/**
 * Render `ui` inside a fresh jotai Provider with a GalleryState probe. Each call gets an isolated
 * imageGalleryAtom so tests cannot leak open/closed gallery state into each other.
 */
export const renderWithGallery = (ui: React.ReactElement) =>
    render(
        <Provider>
            {ui}
            <GalleryState />
        </Provider>,
    );
