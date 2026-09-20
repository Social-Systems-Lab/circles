import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { Avatar, AvatarFallback, AvatarImage } from "./avatar";

// Radix only swaps the fallback for the image after `new window.Image()` fires a load
// event, which never happens in happy-dom. This stub reports an already complete image
// so the loaded branch can be exercised, and it is restored right after the render.
const withLoadedImages = (run: () => void) => {
    const originalImage = globalThis.Image;
    class CompleteImage {
        src = "";
        complete = true;
        naturalWidth = 1;
        referrerPolicy = "";
        crossOrigin: string | null = null;
        addEventListener() {}
        removeEventListener() {}
    }
    globalThis.Image = CompleteImage as unknown as typeof globalThis.Image;
    try {
        run();
    } finally {
        globalThis.Image = originalImage;
    }
};

describe("Avatar", () => {
    test("renders the fallback content inside the avatar root", () => {
        render(
            <Avatar data-testid="avatar">
                <AvatarFallback>AL</AvatarFallback>
            </Avatar>,
        );

        const avatar = screen.getByTestId("avatar");
        expect(avatar.tagName).toBe("SPAN");
        expect(avatar).toContainElement(screen.getByText("AL"));
    });

    test("gives the root the circular clipping classes", () => {
        render(
            <Avatar data-testid="avatar">
                <AvatarFallback>AL</AvatarFallback>
            </Avatar>,
        );

        expect(screen.getByTestId("avatar")).toHaveClass("relative", "h-10", "w-10", "overflow-hidden", "rounded-full");
    });

    test("keeps showing the fallback while the image has not loaded", () => {
        render(
            <Avatar data-testid="avatar">
                <AvatarImage src="/images/ada.png" alt="Ada Lovelace" />
                <AvatarFallback>AL</AvatarFallback>
            </Avatar>,
        );

        expect(screen.queryByRole("img")).toBeNull();
        expect(screen.getByText("AL")).toBeInTheDocument();
    });

    test("reports the loading status while the image is still being fetched", () => {
        const statuses: string[] = [];
        render(
            <Avatar>
                <AvatarImage src="/images/ada.png" alt="Ada Lovelace" onLoadingStatusChange={(s) => statuses.push(s)} />
                <AvatarFallback>AL</AvatarFallback>
            </Avatar>,
        );

        expect(statuses).toEqual(["loading"]);
    });

    test("reports an error status and keeps the fallback when the image has no src", () => {
        const statuses: string[] = [];
        render(
            <Avatar>
                <AvatarImage alt="Ada Lovelace" onLoadingStatusChange={(s) => statuses.push(s)} />
                <AvatarFallback>AL</AvatarFallback>
            </Avatar>,
        );

        expect(statuses).toEqual(["error"]);
        expect(screen.getByText("AL")).toBeInTheDocument();
    });

    test("renders the image and drops the fallback once the image reports that it loaded", () => {
        withLoadedImages(() => {
            render(
                <Avatar>
                    <AvatarImage src="/images/ada.png" alt="Ada Lovelace" />
                    <AvatarFallback>AL</AvatarFallback>
                </Avatar>,
            );

            const image = screen.getByRole("img", { name: "Ada Lovelace" });
            expect(image.tagName).toBe("IMG");
            expect(image).toHaveAttribute("src", "/images/ada.png");
            expect(screen.queryByText("AL")).toBeNull();
        });
    });

    test("merges a custom class into the loaded image and keeps it filling the root", () => {
        withLoadedImages(() => {
            render(
                <Avatar>
                    <AvatarImage src="/images/ada.png" alt="Ada Lovelace" className="grayscale" />
                </Avatar>,
            );

            expect(screen.getByRole("img", { name: "Ada Lovelace" })).toHaveClass(
                "grayscale",
                "aspect-square",
                "h-full",
                "w-full",
                "object-cover",
            );
        });
    });

    test("passes native image attributes through to the loaded image", () => {
        withLoadedImages(() => {
            render(
                <Avatar>
                    <AvatarImage src="/images/ada.png" alt="Ada Lovelace" id="member-avatar" loading="lazy" />
                </Avatar>,
            );

            const image = screen.getByRole("img", { name: "Ada Lovelace" });
            expect(image).toHaveAttribute("id", "member-avatar");
            expect(image).toHaveAttribute("loading", "lazy");
        });
    });

    test("renders the fallback as a centred span filling the root", () => {
        render(
            <Avatar>
                <AvatarFallback data-testid="fallback">AL</AvatarFallback>
            </Avatar>,
        );

        const fallback = screen.getByTestId("fallback");
        expect(fallback.tagName).toBe("SPAN");
        expect(fallback).toHaveClass("flex", "h-full", "w-full", "items-center", "justify-center", "bg-muted");
    });

    test("holds the fallback back until its delay has elapsed", async () => {
        render(
            <Avatar data-testid="avatar">
                <AvatarFallback delayMs={50}>AL</AvatarFallback>
            </Avatar>,
        );

        expect(screen.getByTestId("avatar")).toBeEmptyDOMElement();

        expect(await screen.findByText("AL")).toBeInTheDocument();
    });

    test("renders an empty root when no image and no fallback are given", () => {
        render(<Avatar data-testid="avatar" />);

        expect(screen.getByTestId("avatar")).toBeEmptyDOMElement();
    });

    test("renders non-text fallback content such as an icon", () => {
        render(
            <Avatar>
                <AvatarFallback>
                    <svg data-testid="avatar-icon" />
                </AvatarFallback>
            </Avatar>,
        );

        expect(screen.getByTestId("avatar-icon")).toBeInTheDocument();
    });

    test("merges custom classes on the root and the fallback", () => {
        render(
            <Avatar className="h-20 w-20" data-testid="avatar">
                <AvatarFallback className="bg-amber-200" data-testid="fallback">
                    AL
                </AvatarFallback>
            </Avatar>,
        );

        const avatar = screen.getByTestId("avatar");
        const fallback = screen.getByTestId("fallback");
        expect(avatar).toHaveClass("h-20", "w-20");
        expect(avatar).not.toHaveClass("h-10", "w-10");
        expect(fallback).toHaveClass("bg-amber-200");
        expect(fallback).not.toHaveClass("bg-muted");
    });

    test("passes native attributes through to the root", () => {
        render(
            <Avatar id="member-avatar" title="Ada Lovelace" data-testid="avatar">
                <AvatarFallback>AL</AvatarFallback>
            </Avatar>,
        );

        const avatar = screen.getByTestId("avatar");
        expect(avatar).toHaveAttribute("id", "member-avatar");
        expect(avatar).toHaveAttribute("title", "Ada Lovelace");
    });

    test("renders the child element instead of a span when asChild is set on the root", () => {
        render(
            <Avatar asChild>
                <div data-testid="avatar">
                    <AvatarFallback>AL</AvatarFallback>
                </div>
            </Avatar>,
        );

        const avatar = screen.getByTestId("avatar");
        expect(avatar.tagName).toBe("DIV");
        expect(avatar).toHaveClass("rounded-full");
    });

    test("forwards refs to the root and the fallback", () => {
        const rootRef = { current: null as HTMLSpanElement | null };
        const fallbackRef = { current: null as HTMLSpanElement | null };
        render(
            <Avatar ref={rootRef}>
                <AvatarFallback ref={fallbackRef}>AL</AvatarFallback>
            </Avatar>,
        );

        expect(rootRef.current?.tagName).toBe("SPAN");
        expect(fallbackRef.current).toBe(screen.getByText("AL"));
    });

    test("forwards a ref to the loaded image", () => {
        withLoadedImages(() => {
            const ref = { current: null as HTMLImageElement | null };
            render(
                <Avatar>
                    <AvatarImage src="/images/ada.png" alt="Ada Lovelace" ref={ref} />
                </Avatar>,
            );

            expect(ref.current).toBe(screen.getByRole("img", { name: "Ada Lovelace" }));
        });
    });

    test("renders each avatar independently when several are shown together", () => {
        render(
            <div>
                <Avatar>
                    <AvatarFallback>AL</AvatarFallback>
                </Avatar>
                <Avatar>
                    <AvatarFallback>GH</AvatarFallback>
                </Avatar>
            </div>,
        );

        expect(screen.getByText("AL")).toBeInTheDocument();
        expect(screen.getByText("GH")).toBeInTheDocument();
    });
});
