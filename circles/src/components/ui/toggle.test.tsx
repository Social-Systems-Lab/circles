import { describe, expect, mock, test } from "bun:test";
import * as React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toggle, toggleVariants } from "./toggle";

describe("Toggle", () => {
    test("renders an unpressed toggle button with its children", () => {
        render(<Toggle>Bold</Toggle>);

        const toggle = screen.getByRole("button", { name: "Bold" });
        expect(toggle.tagName).toBe("BUTTON");
        expect(toggle).toHaveAttribute("type", "button");
        expect(toggle).toHaveAttribute("aria-pressed", "false");
        expect(toggle).toHaveAttribute("data-state", "off");
    });

    test("presses and unpresses itself on successive clicks", async () => {
        render(<Toggle>Bold</Toggle>);

        const toggle = screen.getByRole("button", { name: "Bold" });
        await userEvent.click(toggle);
        expect(toggle).toHaveAttribute("aria-pressed", "true");
        expect(toggle).toHaveAttribute("data-state", "on");

        await userEvent.click(toggle);
        expect(toggle).toHaveAttribute("aria-pressed", "false");
        expect(toggle).toHaveAttribute("data-state", "off");
    });

    test("reports the new pressed state to onPressedChange", async () => {
        const onPressedChange = mock((_pressed: boolean) => {});
        render(<Toggle onPressedChange={onPressedChange}>Bold</Toggle>);

        const toggle = screen.getByRole("button", { name: "Bold" });
        await userEvent.click(toggle);
        await userEvent.click(toggle);

        expect(onPressedChange.mock.calls).toEqual([[true], [false]]);
    });

    test("starts pressed when defaultPressed is set", () => {
        render(<Toggle defaultPressed>Bold</Toggle>);

        const toggle = screen.getByRole("button", { name: "Bold" });
        expect(toggle).toHaveAttribute("aria-pressed", "true");
        expect(toggle).toHaveAttribute("data-state", "on");
    });

    test("keeps a controlled toggle unpressed when the parent ignores the change", async () => {
        const onPressedChange = mock((_pressed: boolean) => {});
        render(
            <Toggle pressed={false} onPressedChange={onPressedChange}>
                Bold
            </Toggle>,
        );

        const toggle = screen.getByRole("button", { name: "Bold" });
        await userEvent.click(toggle);

        expect(toggle).toHaveAttribute("aria-pressed", "false");
        expect(onPressedChange.mock.calls).toEqual([[true]]);
    });

    test("follows a controlled pressed value that the parent stores in state", async () => {
        const Controlled = () => {
            const [pressed, setPressed] = React.useState(false);
            return (
                <Toggle pressed={pressed} onPressedChange={setPressed}>
                    Bold
                </Toggle>
            );
        };
        render(<Controlled />);

        await userEvent.click(screen.getByRole("button", { name: "Bold" }));

        expect(screen.getByRole("button", { name: "Bold" })).toHaveAttribute("aria-pressed", "true");
    });

    test("toggles when Space is pressed", async () => {
        render(<Toggle>Bold</Toggle>);

        const toggle = screen.getByRole("button", { name: "Bold" });
        toggle.focus();
        await userEvent.keyboard(" ");

        expect(toggle).toHaveAttribute("aria-pressed", "true");
    });

    test("toggles when Enter is pressed", async () => {
        render(<Toggle>Bold</Toggle>);

        const toggle = screen.getByRole("button", { name: "Bold" });
        toggle.focus();
        await userEvent.keyboard("{Enter}");

        expect(toggle).toHaveAttribute("aria-pressed", "true");
    });

    test("does not call onPressedChange when disabled", async () => {
        const onPressedChange = mock((_pressed: boolean) => {});
        render(
            <Toggle disabled onPressedChange={onPressedChange}>
                Bold
            </Toggle>,
        );

        const toggle = screen.getByRole("button", { name: "Bold" });
        expect(toggle).toBeDisabled();
        expect(toggle).toHaveAttribute("data-disabled", "");

        await userEvent.click(toggle, { pointerEventsCheck: 0 });
        toggle.focus();
        await userEvent.keyboard(" ");

        expect(toggle).toHaveAttribute("aria-pressed", "false");
        expect(onPressedChange.mock.calls).toEqual([]);
    });

    test("keeps its pressed state when a disabled toggle starts out pressed", () => {
        render(
            <Toggle disabled defaultPressed>
                Bold
            </Toggle>,
        );

        expect(screen.getByRole("button", { name: "Bold" })).toHaveAttribute("aria-pressed", "true");
    });

    test("applies the default variant and size classes", () => {
        render(<Toggle>Bold</Toggle>);

        const toggle = screen.getByRole("button", { name: "Bold" });
        expect(toggle).toHaveClass("bg-transparent", "h-10", "px-3", "min-w-10");
    });

    test("applies the requested variant and size classes", () => {
        render(
            <Toggle variant="outline" size="sm">
                Bold
            </Toggle>,
        );

        const toggle = screen.getByRole("button", { name: "Bold" });
        expect(toggle).toHaveClass("border", "border-input", "h-9", "px-2.5", "min-w-9");
        expect(toggle).not.toHaveClass("h-10");
    });

    test("applies the large size classes", () => {
        render(<Toggle size="lg">Bold</Toggle>);

        expect(screen.getByRole("button", { name: "Bold" })).toHaveClass("h-11", "px-5", "min-w-11");
    });

    test("keeps the data-state styling hooks that drive the pressed appearance", () => {
        render(<Toggle>Bold</Toggle>);

        const toggle = screen.getByRole("button", { name: "Bold" });
        expect(toggle.className).toContain("data-[state=on]:bg-accent");
        expect(toggle.className).toContain("data-[state=on]:text-accent-foreground");
    });

    test("merges custom classes with the variant classes", () => {
        render(<Toggle className="custom-class">Bold</Toggle>);

        const toggle = screen.getByRole("button", { name: "Bold" });
        expect(toggle).toHaveClass("custom-class", "inline-flex", "rounded-md");
    });

    test("lets a custom class override the conflicting size class", () => {
        render(<Toggle className="h-20">Bold</Toggle>);

        const toggle = screen.getByRole("button", { name: "Bold" });
        expect(toggle).toHaveClass("h-20");
        expect(toggle).not.toHaveClass("h-10");
    });

    test("lets the outline variant replace the base hover classes", () => {
        render(<Toggle variant="outline">Bold</Toggle>);

        const toggle = screen.getByRole("button", { name: "Bold" });
        expect(toggle).toHaveClass("hover:bg-accent", "hover:text-accent-foreground");
        expect(toggle).not.toHaveClass("hover:bg-muted", "hover:text-muted-foreground");
    });

    test("exposes toggleVariants so other elements can borrow the toggle styling", () => {
        expect(toggleVariants()).toContain("h-10");
        expect(toggleVariants({ size: "sm" })).toContain("h-9");
        expect(toggleVariants({ variant: "outline" })).toContain("border-input");
    });

    test("forwards a ref to the underlying button", () => {
        let captured: HTMLButtonElement | null = null;
        render(<Toggle ref={(node) => {
                captured = node;
            }}>Bold</Toggle>);

        expect(captured).not.toBeNull();
        expect((captured as unknown as HTMLButtonElement).tagName).toBe("BUTTON");
    });

    test("runs a caller supplied onClick alongside the toggle change", async () => {
        const order: string[] = [];
        render(
            <Toggle onClick={() => order.push("click")} onPressedChange={() => order.push("pressed-change")}>
                Bold
            </Toggle>,
        );

        await userEvent.click(screen.getByRole("button", { name: "Bold" }));

        expect(order).toEqual(["click", "pressed-change"]);
    });

    test("passes through native button attributes", () => {
        render(
            <Toggle aria-label="Toggle bold" title="Bold text" name="bold">
                B
            </Toggle>,
        );

        const toggle = screen.getByRole("button", { name: "Toggle bold" });
        expect(toggle).toHaveAttribute("title", "Bold text");
        expect(toggle).toHaveAttribute("name", "bold");
    });
});
