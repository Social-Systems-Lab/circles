import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { Separator } from "./separator";

describe("Separator", () => {
    test("is decorative and hidden from assistive technology by default", () => {
        render(<Separator data-testid="separator" />);

        const separator = screen.getByTestId("separator");
        expect(separator).toHaveAttribute("role", "none");
        expect(screen.queryByRole("separator")).toBeNull();
    });

    test("defaults to a horizontal orientation", () => {
        render(<Separator data-testid="separator" />);

        const separator = screen.getByTestId("separator");
        expect(separator).toHaveAttribute("data-orientation", "horizontal");
        expect(separator).toHaveClass("h-[1px]", "w-full");
    });

    test("exposes the separator role when it is not decorative", () => {
        render(<Separator decorative={false} data-testid="separator" />);

        expect(screen.getByRole("separator")).toBe(screen.getByTestId("separator"));
    });

    test("leaves aria-orientation off a horizontal semantic separator because horizontal is the implicit default", () => {
        render(<Separator decorative={false} orientation="horizontal" data-testid="separator" />);

        const separator = screen.getByRole("separator");
        expect(separator).not.toHaveAttribute("aria-orientation");
        expect(separator).toHaveAttribute("data-orientation", "horizontal");
    });

    test("reports aria-orientation on a vertical semantic separator", () => {
        render(<Separator decorative={false} orientation="vertical" data-testid="separator" />);

        const separator = screen.getByRole("separator");
        expect(separator).toHaveAttribute("aria-orientation", "vertical");
        expect(separator).toHaveAttribute("data-orientation", "vertical");
    });

    test("switches to the vertical size classes when the orientation is vertical", () => {
        render(<Separator orientation="vertical" data-testid="separator" />);

        const separator = screen.getByTestId("separator");
        expect(separator).toHaveClass("h-full", "w-[1px]");
        expect(separator).not.toHaveClass("h-[1px]", "w-full");
    });

    test("keeps a vertical separator decorative unless asked otherwise", () => {
        render(<Separator orientation="vertical" data-testid="separator" />);

        const separator = screen.getByTestId("separator");
        expect(separator).toHaveAttribute("role", "none");
        expect(separator).not.toHaveAttribute("aria-orientation");
    });

    test("renders as a div with the shared border colour", () => {
        render(<Separator data-testid="separator" />);

        const separator = screen.getByTestId("separator");
        expect(separator.tagName).toBe("DIV");
        expect(separator).toHaveClass("shrink-0", "bg-border");
    });

    test("merges a custom class with the orientation classes", () => {
        render(<Separator className="my-4" data-testid="separator" />);

        expect(screen.getByTestId("separator")).toHaveClass("my-4", "bg-border", "w-full");
    });

    test("lets a custom class win over the default thickness and colour", () => {
        render(<Separator className="h-[2px] bg-red-500" data-testid="separator" />);

        const separator = screen.getByTestId("separator");
        expect(separator).toHaveClass("h-[2px]", "bg-red-500");
        expect(separator).not.toHaveClass("h-[1px]", "bg-border");
    });

    test("renders the child element instead of a div when asChild is set", () => {
        render(
            <Separator asChild>
                <hr data-testid="separator" />
            </Separator>,
        );

        const separator = screen.getByTestId("separator");
        expect(separator.tagName).toBe("HR");
        expect(separator).toHaveClass("bg-border");
        expect(separator).toHaveAttribute("role", "none");
    });

    test("passes native attributes through", () => {
        render(<Separator id="section-break" lang="en" data-testid="separator" />);

        const separator = screen.getByTestId("separator");
        expect(separator).toHaveAttribute("id", "section-break");
        expect(separator).toHaveAttribute("lang", "en");
    });

    test("forwards a ref to the underlying element", () => {
        const ref = { current: null as HTMLDivElement | null };
        render(<Separator ref={ref} data-testid="separator" />);

        expect(ref.current).toBe(screen.getByTestId("separator"));
    });

    test("renders nothing inside the separator", () => {
        render(<Separator data-testid="separator" />);

        expect(screen.getByTestId("separator")).toBeEmptyDOMElement();
    });
});
