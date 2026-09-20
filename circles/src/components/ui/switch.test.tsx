import { describe, expect, mock, test } from "bun:test";
import * as React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Switch } from "./switch";

describe("Switch", () => {
    test("renders an off switch button by default", () => {
        render(<Switch aria-label="Email notifications" />);

        const switchControl = screen.getByRole("switch", { name: "Email notifications" });
        expect(switchControl.tagName).toBe("BUTTON");
        expect(switchControl).toHaveAttribute("type", "button");
        expect(switchControl).toHaveAttribute("aria-checked", "false");
        expect(switchControl).toHaveAttribute("data-state", "unchecked");
    });

    test("turns on and off again on successive clicks", async () => {
        render(<Switch aria-label="Email notifications" />);

        const switchControl = screen.getByRole("switch", { name: "Email notifications" });
        await userEvent.click(switchControl);
        expect(switchControl).toBeChecked();
        expect(switchControl).toHaveAttribute("data-state", "checked");

        await userEvent.click(switchControl);
        expect(switchControl).not.toBeChecked();
        expect(switchControl).toHaveAttribute("data-state", "unchecked");
    });

    test("reports the new state to onCheckedChange", async () => {
        const onCheckedChange = mock((_checked: boolean) => {});
        render(<Switch aria-label="Email notifications" onCheckedChange={onCheckedChange} />);

        const switchControl = screen.getByRole("switch", { name: "Email notifications" });
        await userEvent.click(switchControl);
        await userEvent.click(switchControl);

        expect(onCheckedChange.mock.calls).toEqual([[true], [false]]);
    });

    test("starts on when defaultChecked is set", () => {
        render(<Switch aria-label="Email notifications" defaultChecked />);

        expect(screen.getByRole("switch", { name: "Email notifications" })).toBeChecked();
    });

    test("keeps a controlled switch off when the parent ignores the change", async () => {
        const onCheckedChange = mock((_checked: boolean) => {});
        render(<Switch aria-label="Email notifications" checked={false} onCheckedChange={onCheckedChange} />);

        const switchControl = screen.getByRole("switch", { name: "Email notifications" });
        await userEvent.click(switchControl);

        expect(switchControl).not.toBeChecked();
        expect(onCheckedChange.mock.calls).toEqual([[true]]);
    });

    test("follows a controlled checked value that the parent stores in state", async () => {
        const Controlled = () => {
            const [checked, setChecked] = React.useState(false);
            return <Switch aria-label="Email notifications" checked={checked} onCheckedChange={setChecked} />;
        };
        render(<Controlled />);

        await userEvent.click(screen.getByRole("switch", { name: "Email notifications" }));

        expect(screen.getByRole("switch", { name: "Email notifications" })).toBeChecked();
    });

    test("toggles when Space is pressed", async () => {
        render(<Switch aria-label="Email notifications" />);

        const switchControl = screen.getByRole("switch", { name: "Email notifications" });
        switchControl.focus();
        await userEvent.keyboard(" ");

        expect(switchControl).toBeChecked();
    });

    test("toggles when Enter is pressed", async () => {
        render(<Switch aria-label="Email notifications" />);

        const switchControl = screen.getByRole("switch", { name: "Email notifications" });
        switchControl.focus();
        await userEvent.keyboard("{Enter}");

        expect(switchControl).toBeChecked();
    });

    test("does not call onCheckedChange when disabled", async () => {
        const onCheckedChange = mock((_checked: boolean) => {});
        render(<Switch aria-label="Email notifications" disabled onCheckedChange={onCheckedChange} />);

        const switchControl = screen.getByRole("switch", { name: "Email notifications" });
        expect(switchControl).toBeDisabled();
        expect(switchControl).toHaveAttribute("data-disabled", "");

        await userEvent.click(switchControl, { pointerEventsCheck: 0 });
        switchControl.focus();
        await userEvent.keyboard(" ");

        expect(switchControl).not.toBeChecked();
        expect(onCheckedChange.mock.calls).toEqual([]);
    });

    test("keeps the thumb state in sync with the switch state", async () => {
        render(<Switch aria-label="Email notifications" />);

        const switchControl = screen.getByRole("switch", { name: "Email notifications" });
        const thumb = switchControl.firstElementChild;
        expect(thumb).toHaveAttribute("data-state", "unchecked");

        await userEvent.click(switchControl);

        expect(thumb).toHaveAttribute("data-state", "checked");
    });

    test("is named by an associated label through htmlFor", () => {
        render(
            <>
                <label htmlFor="notifications">Email notifications</label>
                <Switch id="notifications" />
            </>,
        );

        expect(screen.getByRole("switch", { name: "Email notifications" })).toBeInTheDocument();
    });

    test("merges custom classes with the base switch classes", () => {
        render(<Switch aria-label="Email notifications" className="custom-class" />);

        const switchControl = screen.getByRole("switch", { name: "Email notifications" });
        expect(switchControl).toHaveClass("custom-class");
        expect(switchControl).toHaveClass("peer", "inline-flex", "rounded-full");
    });

    test("lets a custom class override a conflicting base class", () => {
        render(<Switch aria-label="Email notifications" className="h-10" />);

        const switchControl = screen.getByRole("switch", { name: "Email notifications" });
        expect(switchControl).toHaveClass("h-10");
        expect(switchControl).not.toHaveClass("h-6");
    });

    test("forwards a ref to the underlying button", () => {
        let captured: HTMLButtonElement | null = null;
        render(<Switch aria-label="Email notifications" ref={(node) => {
                captured = node;
            }} />);

        expect(captured).not.toBeNull();
        expect((captured as unknown as HTMLButtonElement).tagName).toBe("BUTTON");
    });

    test("renders a hidden checkbox input inside a form that mirrors the state", async () => {
        render(
            <form>
                <Switch aria-label="Email notifications" name="notifications" />
            </form>,
        );

        const hidden = document.querySelector<HTMLInputElement>('input[name="notifications"]');
        expect(hidden).not.toBeNull();
        expect(hidden?.checked).toBe(false);

        await userEvent.click(screen.getByRole("switch", { name: "Email notifications" }));

        expect(hidden?.checked).toBe(true);
    });

    test("renders no hidden input when it is used outside a form", () => {
        render(<Switch aria-label="Email notifications" name="notifications" />);

        expect(document.querySelector('input[name="notifications"]')).toBeNull();
    });

    test("submits the custom value with the surrounding form when it is on", async () => {
        let submitted: FormDataEntryValue | null = null;
        render(
            <form
                onSubmit={(event) => {
                    event.preventDefault();
                    submitted = new FormData(event.currentTarget).get("notifications");
                }}
            >
                <Switch aria-label="Email notifications" name="notifications" value="enabled" />
                <button type="submit">Save</button>
            </form>,
        );

        await userEvent.click(screen.getByRole("switch", { name: "Email notifications" }));
        await userEvent.click(screen.getByRole("button", { name: "Save" }));

        expect(submitted).toBe("enabled");
    });

    test("leaves the value out of the submitted form data while it is off", async () => {
        let submitted: FormDataEntryValue | null = null;
        render(
            <form
                onSubmit={(event) => {
                    event.preventDefault();
                    submitted = new FormData(event.currentTarget).get("notifications");
                }}
            >
                <Switch aria-label="Email notifications" name="notifications" />
                <button type="submit">Save</button>
            </form>,
        );

        await userEvent.click(screen.getByRole("button", { name: "Save" }));

        expect(submitted).toBeNull();
    });
});
