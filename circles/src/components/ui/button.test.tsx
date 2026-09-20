import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button, buttonVariants } from "./button";

describe("Button", () => {
    test("renders a button element with its children", () => {
        render(<Button>Save changes</Button>);

        const button = screen.getByRole("button", { name: "Save changes" });
        expect(button.tagName).toBe("BUTTON");
    });

    test("calls onClick when clicked", async () => {
        let clicks = 0;
        render(<Button onClick={() => (clicks += 1)}>Click me</Button>);

        await userEvent.click(screen.getByRole("button", { name: "Click me" }));

        expect(clicks).toBe(1);
    });

    test("does not call onClick when disabled", async () => {
        let clicks = 0;
        render(
            <Button disabled onClick={() => (clicks += 1)}>
                Click me
            </Button>,
        );

        const button = screen.getByRole("button", { name: "Click me" });
        expect(button).toBeDisabled();

        await userEvent.click(button, { pointerEventsCheck: 0 });

        expect(clicks).toBe(0);
    });

    test("renders the child element instead of a button when asChild is set", () => {
        render(
            <Button asChild>
                <a href="/circles">Browse circles</a>
            </Button>,
        );

        const link = screen.getByRole("link", { name: "Browse circles" });
        expect(link.tagName).toBe("A");
        expect(screen.queryByRole("button")).toBeNull();
    });

    test("merges custom classes with the variant classes", () => {
        render(<Button className="custom-class">Styled</Button>);

        const button = screen.getByRole("button", { name: "Styled" });
        expect(button.className).toContain("custom-class");
        expect(button.className).toContain("inline-flex");
    });

    test("applies the requested variant and size classes", () => {
        render(
            <Button variant="destructive" size="sm">
                Delete
            </Button>,
        );

        const button = screen.getByRole("button", { name: "Delete" });
        expect(button).toHaveClass("bg-destructive", "text-destructive-foreground", "h-9", "px-3");
    });

    test("defaults to the default variant and size", () => {
        render(<Button>Default</Button>);

        const button = screen.getByRole("button", { name: "Default" });
        expect(button).toHaveClass("h-10", "px-4", "py-2");
        expect(button.className).toContain("--button-primary");
    });

    test("exposes the same classes through buttonVariants as the rendered button", () => {
        render(<Button variant="outline">Outline</Button>);

        const variantClasses = buttonVariants({ variant: "outline" }).split(" ");
        expect(screen.getByRole("button", { name: "Outline" })).toHaveClass(...variantClasses);
    });

    test("forwards a ref to the underlying button", () => {
        let captured: HTMLButtonElement | null = null;
        render(<Button ref={(node) => (captured = node)}>With ref</Button>);

        expect(captured).not.toBeNull();
        expect((captured as unknown as HTMLButtonElement).tagName).toBe("BUTTON");
    });

    test("passes through native button attributes", () => {
        render(
            <Button type="submit" aria-label="Submit form" name="submit-button">
                Submit
            </Button>,
        );

        const button = screen.getByRole("button", { name: "Submit form" });
        expect(button).toHaveAttribute("type", "submit");
        expect(button).toHaveAttribute("name", "submit-button");
    });
});
