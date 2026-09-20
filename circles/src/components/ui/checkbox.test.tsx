import { describe, expect, mock, test } from "bun:test";
import * as React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Checkbox } from "./checkbox";

describe("Checkbox", () => {
    test("renders an unchecked checkbox button by default", () => {
        render(<Checkbox aria-label="Accept terms" />);

        const checkbox = screen.getByRole("checkbox", { name: "Accept terms" });
        expect(checkbox.tagName).toBe("BUTTON");
        expect(checkbox).toHaveAttribute("aria-checked", "false");
        expect(checkbox).toHaveAttribute("data-state", "unchecked");
    });

    test("hides the check indicator until the checkbox is checked", async () => {
        render(<Checkbox aria-label="Accept terms" />);

        const checkbox = screen.getByRole("checkbox", { name: "Accept terms" });
        expect(checkbox.querySelector("svg")).toBeNull();

        await userEvent.click(checkbox);

        expect(checkbox.querySelector("svg")).not.toBeNull();
    });

    test("checks and unchecks itself on successive clicks", async () => {
        render(<Checkbox aria-label="Accept terms" />);

        const checkbox = screen.getByRole("checkbox", { name: "Accept terms" });
        await userEvent.click(checkbox);
        expect(checkbox).toBeChecked();
        expect(checkbox).toHaveAttribute("data-state", "checked");

        await userEvent.click(checkbox);
        expect(checkbox).not.toBeChecked();
        expect(checkbox).toHaveAttribute("data-state", "unchecked");
    });

    test("reports the new checked state to onCheckedChange", async () => {
        const onCheckedChange = mock((_checked: boolean | "indeterminate") => {});
        render(<Checkbox aria-label="Accept terms" onCheckedChange={onCheckedChange} />);

        const checkbox = screen.getByRole("checkbox", { name: "Accept terms" });
        await userEvent.click(checkbox);
        await userEvent.click(checkbox);

        expect(onCheckedChange.mock.calls).toEqual([[true], [false]]);
    });

    test("starts checked when defaultChecked is set", () => {
        render(<Checkbox aria-label="Accept terms" defaultChecked />);

        expect(screen.getByRole("checkbox", { name: "Accept terms" })).toBeChecked();
    });

    test("keeps a controlled checkbox unchecked when the parent ignores the change", async () => {
        const onCheckedChange = mock((_checked: boolean | "indeterminate") => {});
        render(<Checkbox aria-label="Accept terms" checked={false} onCheckedChange={onCheckedChange} />);

        const checkbox = screen.getByRole("checkbox", { name: "Accept terms" });
        await userEvent.click(checkbox);

        expect(checkbox).not.toBeChecked();
        expect(onCheckedChange.mock.calls).toEqual([[true]]);
    });

    test("follows a controlled checked value that the parent stores in state", async () => {
        const Controlled = () => {
            const [checked, setChecked] = React.useState(false);
            return <Checkbox aria-label="Accept terms" checked={checked} onCheckedChange={(next) => setChecked(next === true)} />;
        };
        render(<Controlled />);

        await userEvent.click(screen.getByRole("checkbox", { name: "Accept terms" }));

        expect(screen.getByRole("checkbox", { name: "Accept terms" })).toBeChecked();
    });

    test("toggles when Space is pressed", async () => {
        render(<Checkbox aria-label="Accept terms" />);

        const checkbox = screen.getByRole("checkbox", { name: "Accept terms" });
        checkbox.focus();
        await userEvent.keyboard(" ");

        expect(checkbox).toBeChecked();
    });

    test("does not toggle when Enter is pressed, following the checkbox ARIA pattern", async () => {
        render(<Checkbox aria-label="Accept terms" />);

        const checkbox = screen.getByRole("checkbox", { name: "Accept terms" });
        checkbox.focus();
        await userEvent.keyboard("{Enter}");

        expect(checkbox).not.toBeChecked();
    });

    test("reports a mixed state when checked is indeterminate", () => {
        render(<Checkbox aria-label="Accept terms" checked="indeterminate" />);

        const checkbox = screen.getByRole("checkbox", { name: "Accept terms" });
        expect(checkbox).toHaveAttribute("aria-checked", "mixed");
        expect(checkbox).toHaveAttribute("data-state", "indeterminate");
        expect(checkbox).toBePartiallyChecked();
    });

    test("shows the indicator while indeterminate", () => {
        render(<Checkbox aria-label="Accept terms" checked="indeterminate" />);

        expect(screen.getByRole("checkbox", { name: "Accept terms" }).querySelector("svg")).not.toBeNull();
    });

    test("asks to become checked when an indeterminate checkbox is clicked", async () => {
        const onCheckedChange = mock((_checked: boolean | "indeterminate") => {});
        render(<Checkbox aria-label="Accept terms" checked="indeterminate" onCheckedChange={onCheckedChange} />);

        await userEvent.click(screen.getByRole("checkbox", { name: "Accept terms" }));

        expect(onCheckedChange.mock.calls).toEqual([[true]]);
    });

    test("does not call onCheckedChange when disabled", async () => {
        const onCheckedChange = mock((_checked: boolean | "indeterminate") => {});
        render(<Checkbox aria-label="Accept terms" disabled onCheckedChange={onCheckedChange} />);

        const checkbox = screen.getByRole("checkbox", { name: "Accept terms" });
        expect(checkbox).toBeDisabled();
        expect(checkbox).toHaveAttribute("data-disabled", "");

        await userEvent.click(checkbox, { pointerEventsCheck: 0 });
        checkbox.focus();
        await userEvent.keyboard(" ");

        expect(checkbox).not.toBeChecked();
        expect(onCheckedChange.mock.calls).toEqual([]);
    });

    test("marks itself required for assistive technology", () => {
        render(<Checkbox aria-label="Accept terms" required />);

        expect(screen.getByRole("checkbox", { name: "Accept terms" })).toHaveAttribute("aria-required", "true");
    });

    test("is named by an associated Label through htmlFor", () => {
        render(
            <>
                <label htmlFor="terms">Accept the terms</label>
                <Checkbox id="terms" />
            </>,
        );

        expect(screen.getByRole("checkbox", { name: "Accept the terms" })).toBeInTheDocument();
    });

    test("merges custom classes with the base checkbox classes", () => {
        render(<Checkbox aria-label="Accept terms" className="custom-class" />);

        const checkbox = screen.getByRole("checkbox", { name: "Accept terms" });
        expect(checkbox).toHaveClass("custom-class");
        expect(checkbox).toHaveClass("peer", "shrink-0", "rounded-sm");
    });

    test("forwards a ref to the underlying button", () => {
        let captured: HTMLButtonElement | null = null;
        render(<Checkbox aria-label="Accept terms" ref={(node) => {
                captured = node;
            }} />);

        expect(captured).not.toBeNull();
        expect((captured as unknown as HTMLButtonElement).tagName).toBe("BUTTON");
    });

    test("renders a hidden input inside a form so the value can be submitted", async () => {
        render(
            <form>
                <Checkbox aria-label="Accept terms" name="terms" defaultChecked />
            </form>,
        );

        const hidden = document.querySelector<HTMLInputElement>('input[name="terms"]');
        expect(hidden).not.toBeNull();
        expect(hidden).toHaveAttribute("type", "checkbox");
        expect(hidden?.checked).toBe(true);
    });

    test("renders no hidden input when it is used outside a form", () => {
        render(<Checkbox aria-label="Accept terms" name="terms" />);

        expect(document.querySelector('input[name="terms"]')).toBeNull();
    });

    test("submits the checked value with the surrounding form", async () => {
        let submitted: FormDataEntryValue | null = null;
        render(
            <form
                onSubmit={(event) => {
                    event.preventDefault();
                    submitted = new FormData(event.currentTarget).get("terms");
                }}
            >
                <Checkbox aria-label="Accept terms" name="terms" />
                <button type="submit">Save</button>
            </form>,
        );

        await userEvent.click(screen.getByRole("checkbox", { name: "Accept terms" }));
        await userEvent.click(screen.getByRole("button", { name: "Save" }));

        expect(submitted).toBe("on");
    });
});
