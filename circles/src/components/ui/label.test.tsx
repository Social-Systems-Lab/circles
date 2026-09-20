import { describe, expect, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Label } from "./label";

describe("Label", () => {
    test("renders a label element with its text", () => {
        render(<Label>Display name</Label>);

        const label = screen.getByText("Display name");
        expect(label.tagName).toBe("LABEL");
    });

    test("names the control it points at with htmlFor", () => {
        render(
            <>
                <Label htmlFor="email">Email address</Label>
                <input id="email" />
            </>,
        );

        expect(screen.getByText("Email address")).toHaveAttribute("for", "email");
        expect(screen.getByLabelText("Email address")).toBe(screen.getByRole("textbox"));
    });

    test("names a control that it wraps", () => {
        render(
            <Label>
                Newsletter
                <input type="checkbox" />
            </Label>,
        );

        expect(screen.getByLabelText("Newsletter")).toBe(screen.getByRole("checkbox"));
    });

    test("toggles the checkbox it labels when the label text is clicked", async () => {
        render(
            <>
                <Label htmlFor="terms">Accept terms</Label>
                <input id="terms" type="checkbox" />
            </>,
        );

        await userEvent.click(screen.getByText("Accept terms"));

        expect(screen.getByRole("checkbox")).toBeChecked();
    });

    test("prevents the default text selection on a double click", () => {
        render(<Label>Selectable text</Label>);

        const label = screen.getByText("Selectable text");
        const firstClickWasAllowed = fireEvent.mouseDown(label, { detail: 1 });
        const doubleClickWasAllowed = fireEvent.mouseDown(label, { detail: 2 });

        expect(firstClickWasAllowed).toBe(true);
        expect(doubleClickWasAllowed).toBe(false);
    });

    test("calls onMouseDown when the press starts on the label itself", () => {
        let presses = 0;
        render(<Label onMouseDown={() => (presses += 1)}>Press me</Label>);

        fireEvent.mouseDown(screen.getByText("Press me"));

        expect(presses).toBe(1);
    });

    test("skips its own onMouseDown when the press starts on a nested form control", () => {
        let presses = 0;
        render(
            <Label onMouseDown={() => (presses += 1)}>
                Nested control
                <input aria-label="Nested input" />
            </Label>,
        );

        fireEvent.mouseDown(screen.getByLabelText("Nested input"));

        expect(presses).toBe(0);
    });

    test("merges custom classes with the base label classes", () => {
        render(<Label className="custom-class">Styled</Label>);

        const label = screen.getByText("Styled");
        expect(label).toHaveClass("custom-class");
        expect(label).toHaveClass("text-sm", "font-medium", "leading-none");
    });

    test("keeps the peer-disabled styling hooks so it dims with a disabled control", () => {
        render(<Label htmlFor="field">Dimmable</Label>);

        const label = screen.getByText("Dimmable");
        expect(label.className).toContain("peer-disabled:cursor-not-allowed");
        expect(label.className).toContain("peer-disabled:opacity-70");
    });

    test("lets a custom class override a conflicting base class", () => {
        render(<Label className="text-lg">Large</Label>);

        const label = screen.getByText("Large");
        expect(label).toHaveClass("text-lg");
        expect(label).not.toHaveClass("text-sm");
    });

    test("forwards a ref to the underlying label", () => {
        let captured: HTMLLabelElement | null = null;
        render(<Label ref={(node) => {
                captured = node;
            }}>With ref</Label>);

        expect(captured).not.toBeNull();
        expect((captured as unknown as HTMLLabelElement).tagName).toBe("LABEL");
    });

    test("passes through native label attributes", () => {
        render(
            <Label id="name-label" data-testid="name-label" title="Your full name">
                Name
            </Label>,
        );

        const label = screen.getByTestId("name-label");
        expect(label).toHaveAttribute("id", "name-label");
        expect(label).toHaveAttribute("title", "Your full name");
    });
});
