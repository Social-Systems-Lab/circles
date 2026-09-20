import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Badge, type BadgeProps, badgeVariants } from "./badge";

describe("Badge", () => {
    test("renders its children inside a plain div", () => {
        render(<Badge>Organiser</Badge>);

        const badge = screen.getByText("Organiser");
        expect(badge.tagName).toBe("DIV");
    });

    test("renders an empty badge when no children are given", () => {
        render(<Badge data-testid="empty-badge" />);

        expect(screen.getByTestId("empty-badge")).toBeEmptyDOMElement();
    });

    test("uses the default variant when no variant is given", () => {
        render(<Badge>Default</Badge>);

        expect(screen.getByText("Default")).toHaveClass("bg-primary", "text-primary-foreground", "border-transparent");
    });

    test("uses the default variant when variant is explicitly undefined", () => {
        render(<Badge variant={undefined}>Undefined variant</Badge>);

        expect(screen.getByText("Undefined variant")).toHaveClass("bg-primary", "text-primary-foreground");
    });

    test("applies the secondary variant classes", () => {
        render(<Badge variant="secondary">Draft</Badge>);

        const badge = screen.getByText("Draft");
        expect(badge).toHaveClass("bg-secondary", "text-secondary-foreground");
        expect(badge).not.toHaveClass("bg-primary");
    });

    test("applies the destructive variant classes", () => {
        render(<Badge variant="destructive">Blocked</Badge>);

        expect(screen.getByText("Blocked")).toHaveClass("bg-destructive", "text-destructive-foreground");
    });

    test("draws the outline variant with a visible border and no background colour", () => {
        render(<Badge variant="outline">Outline</Badge>);

        const badge = screen.getByText("Outline");
        expect(badge).toHaveClass("text-foreground", "border");
        expect(badge).not.toHaveClass("border-transparent", "bg-primary");
    });

    test("uses the project palette for the skill, interest and need variants", () => {
        const palette: Array<[NonNullable<BadgeProps["variant"]>, string]> = [
            ["skill", "bg-[#6f94bc]"],
            ["interest", "bg-[#8ea065]"],
            ["need", "bg-[#6b8fb5]"],
        ];

        for (const [variant, backgroundClass] of palette) {
            const { unmount } = render(<Badge variant={variant}>{variant}</Badge>);

            expect(screen.getByText(variant)).toHaveClass(backgroundClass, "text-white");

            unmount();
        }
    });

    test("keeps the shared layout classes for every variant", () => {
        render(<Badge variant="skill">Gardening</Badge>);

        expect(screen.getByText("Gardening")).toHaveClass("inline-flex", "items-center", "rounded-full", "text-xs");
    });

    test("exposes the same classes through badgeVariants as the rendered badge", () => {
        render(<Badge variant="interest">Interest</Badge>);

        const variantClasses = badgeVariants({ variant: "interest" }).split(" ");
        expect(screen.getByText("Interest")).toHaveClass(...variantClasses);
    });

    test("badgeVariants falls back to the default variant when called without arguments", () => {
        expect(badgeVariants()).toBe(badgeVariants({ variant: "default" }));
    });

    test("merges a custom class with the variant classes", () => {
        render(<Badge className="custom-class">Styled</Badge>);

        expect(screen.getByText("Styled")).toHaveClass("custom-class", "inline-flex");
    });

    test("lets a custom class win over a conflicting variant class", () => {
        render(
            <Badge variant="skill" className="rounded-none">
                Square
            </Badge>,
        );

        const badge = screen.getByText("Square");
        expect(badge).toHaveClass("rounded-none");
        expect(badge).not.toHaveClass("rounded-full");
    });

    test("passes native div attributes through", () => {
        render(
            <Badge id="role-badge" title="Circle role" data-testid="badge" lang="en">
                Organiser
            </Badge>,
        );

        const badge = screen.getByTestId("badge");
        expect(badge).toHaveAttribute("id", "role-badge");
        expect(badge).toHaveAttribute("title", "Circle role");
        expect(badge).toHaveAttribute("lang", "en");
    });

    test("calls onClick when the badge is clicked", async () => {
        let clicks = 0;
        render(<Badge onClick={() => (clicks += 1)}>Clickable</Badge>);

        await userEvent.click(screen.getByText("Clickable"));

        expect(clicks).toBe(1);
    });

    test("is not keyboard focusable and has no interactive role despite its focus ring classes", () => {
        render(<Badge onClick={() => {}}>Clickable</Badge>);

        const badge = screen.getByText("Clickable");
        expect(badge).toHaveClass("focus:ring-2");
        expect(badge).not.toHaveAttribute("tabindex");
        expect(badge).not.toHaveAttribute("role");
    });

    test("hands a ref through to the rendered div even though Badge is not a forwardRef component", () => {
        const ref = { current: null as HTMLDivElement | null };
        render(<Badge {...({ ref } as unknown as BadgeProps)}>With ref</Badge>);

        expect(ref.current).not.toBeNull();
        expect(ref.current).toBe(screen.getByText("With ref"));
    });
});
