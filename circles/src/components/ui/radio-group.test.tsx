import { describe, expect, mock, test } from "bun:test";
import * as React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { focusElement } from "@/test/react-act";
import { RadioGroup, RadioGroupItem } from "./radio-group";

const renderGroup = (props: Partial<React.ComponentProps<typeof RadioGroup>> = {}) =>
    render(
        <RadioGroup aria-label="Visibility" {...props}>
            <RadioGroupItem value="public" aria-label="Public" />
            <RadioGroupItem value="members" aria-label="Members only" />
            <RadioGroupItem value="private" aria-label="Private" />
        </RadioGroup>,
    );

// Radix defers the roving-focus move to a macrotask and only selects the newly focused option while
// an arrow key is still held, so the press and the release have to be awaited separately.
const pressArrow = async (key: "ArrowDown" | "ArrowUp" | "ArrowLeft" | "ArrowRight") => {
    await userEvent.keyboard(`{${key}>}`);
    await userEvent.keyboard(`{/${key}}`);
};

describe("RadioGroup", () => {
    test("renders a radiogroup with every option unselected", () => {
        renderGroup();

        expect(screen.getByRole("radiogroup", { name: "Visibility" })).toBeInTheDocument();
        expect(screen.getAllByRole("radio")).toHaveLength(3);
        for (const radio of screen.getAllByRole("radio")) {
            expect(radio).toHaveAttribute("aria-checked", "false");
            expect(radio).toHaveAttribute("data-state", "unchecked");
        }
    });

    test("selects the clicked option and leaves the others unselected", async () => {
        renderGroup();

        await userEvent.click(screen.getByRole("radio", { name: "Members only" }));

        expect(screen.getByRole("radio", { name: "Members only" })).toBeChecked();
        expect(screen.getByRole("radio", { name: "Members only" })).toHaveAttribute("data-state", "checked");
        expect(screen.getByRole("radio", { name: "Public" })).not.toBeChecked();
        expect(screen.getByRole("radio", { name: "Private" })).not.toBeChecked();
    });

    test("reports the selected value to onValueChange", async () => {
        const onValueChange = mock((_value: string) => {});
        renderGroup({ onValueChange });

        await userEvent.click(screen.getByRole("radio", { name: "Private" }));

        expect(onValueChange.mock.calls).toEqual([["private"]]);
    });

    test("does not report a change when the already selected option is clicked again", async () => {
        const onValueChange = mock((_value: string) => {});
        renderGroup({ defaultValue: "public", onValueChange });

        await userEvent.click(screen.getByRole("radio", { name: "Public" }));

        expect(onValueChange.mock.calls).toEqual([]);
    });

    test("preselects the option given by defaultValue", () => {
        renderGroup({ defaultValue: "members" });

        expect(screen.getByRole("radio", { name: "Members only" })).toBeChecked();
    });

    test("keeps a controlled selection fixed when the parent ignores the change", async () => {
        const onValueChange = mock((_value: string) => {});
        renderGroup({ value: "public", onValueChange });

        await userEvent.click(screen.getByRole("radio", { name: "Private" }));

        expect(screen.getByRole("radio", { name: "Public" })).toBeChecked();
        expect(screen.getByRole("radio", { name: "Private" })).not.toBeChecked();
        expect(onValueChange.mock.calls).toEqual([["private"]]);
    });

    test("follows a controlled selection that the parent stores in state", async () => {
        const Controlled = () => {
            const [value, setValue] = React.useState("public");
            return (
                <RadioGroup aria-label="Visibility" value={value} onValueChange={setValue}>
                    <RadioGroupItem value="public" aria-label="Public" />
                    <RadioGroupItem value="private" aria-label="Private" />
                </RadioGroup>
            );
        };
        render(<Controlled />);

        await userEvent.click(screen.getByRole("radio", { name: "Private" }));

        expect(screen.getByRole("radio", { name: "Private" })).toBeChecked();
    });

    test("shows the indicator only on the selected option", async () => {
        renderGroup();

        expect(screen.getByRole("radio", { name: "Public" }).querySelector("svg")).toBeNull();

        await userEvent.click(screen.getByRole("radio", { name: "Public" }));

        expect(screen.getByRole("radio", { name: "Public" }).querySelector("svg")).not.toBeNull();
        expect(screen.getByRole("radio", { name: "Private" }).querySelector("svg")).toBeNull();
    });

    test("moves focus to the next option when the down arrow is pressed", async () => {
        renderGroup({ defaultValue: "public" });

        await focusElement(screen.getByRole("radio", { name: "Public" }));
        await userEvent.keyboard("{ArrowDown}");

        expect(screen.getByRole("radio", { name: "Members only" })).toHaveFocus();
    });

    test("selects the next option when the down arrow is held", async () => {
        renderGroup({ defaultValue: "public" });

        await focusElement(screen.getByRole("radio", { name: "Public" }));
        await pressArrow("ArrowDown");

        expect(screen.getByRole("radio", { name: "Members only" })).toBeChecked();
        expect(screen.getByRole("radio", { name: "Public" })).not.toBeChecked();
    });

    test("selects the previous option when the up arrow is held", async () => {
        renderGroup({ defaultValue: "members" });

        await focusElement(screen.getByRole("radio", { name: "Members only" }));
        await pressArrow("ArrowUp");

        expect(screen.getByRole("radio", { name: "Public" })).toBeChecked();
    });

    test("wraps around to the first option when arrowing past the last one", async () => {
        renderGroup({ defaultValue: "private" });

        await focusElement(screen.getByRole("radio", { name: "Private" }));
        await pressArrow("ArrowDown");

        expect(screen.getByRole("radio", { name: "Public" })).toBeChecked();
    });

    test("stays on the last option when arrowing past it with loop turned off", async () => {
        renderGroup({ defaultValue: "private", loop: false });

        await focusElement(screen.getByRole("radio", { name: "Private" }));
        await pressArrow("ArrowDown");

        expect(screen.getByRole("radio", { name: "Private" })).toBeChecked();
        expect(screen.getByRole("radio", { name: "Public" })).not.toBeChecked();
    });

    test("skips a disabled option while arrowing through the group", async () => {
        render(
            <RadioGroup aria-label="Visibility" defaultValue="public">
                <RadioGroupItem value="public" aria-label="Public" />
                <RadioGroupItem value="members" aria-label="Members only" disabled />
                <RadioGroupItem value="private" aria-label="Private" />
            </RadioGroup>,
        );

        await focusElement(screen.getByRole("radio", { name: "Public" }));
        await pressArrow("ArrowDown");

        expect(screen.getByRole("radio", { name: "Members only" })).not.toBeChecked();
        expect(screen.getByRole("radio", { name: "Private" })).toBeChecked();
    });

    test("takes a single tab stop that lands on the selected option", async () => {
        renderGroup({ defaultValue: "members" });

        expect(screen.getByRole("radiogroup", { name: "Visibility" })).toHaveAttribute("tabindex", "0");
        expect(screen.getByRole("radio", { name: "Public" })).toHaveAttribute("tabindex", "-1");

        await userEvent.tab();

        expect(screen.getByRole("radio", { name: "Members only" })).toHaveFocus();
    });

    test("moves the tab stop onto the option the user last picked", async () => {
        renderGroup({ defaultValue: "public" });

        await userEvent.click(screen.getByRole("radio", { name: "Private" }));

        expect(screen.getByRole("radio", { name: "Private" })).toHaveAttribute("tabindex", "0");
        expect(screen.getByRole("radio", { name: "Public" })).toHaveAttribute("tabindex", "-1");
    });

    test("does not select anything when the whole group is disabled", async () => {
        const onValueChange = mock((_value: string) => {});
        renderGroup({ disabled: true, onValueChange });

        const radio = screen.getByRole("radio", { name: "Public" });
        expect(radio).toBeDisabled();
        expect(radio).toHaveAttribute("data-disabled", "");

        await userEvent.click(radio, { pointerEventsCheck: 0 });

        expect(radio).not.toBeChecked();
        expect(onValueChange.mock.calls).toEqual([]);
    });

    test("does not select a single disabled option", async () => {
        const onValueChange = mock((_value: string) => {});
        render(
            <RadioGroup aria-label="Visibility" onValueChange={onValueChange}>
                <RadioGroupItem value="public" aria-label="Public" />
                <RadioGroupItem value="private" aria-label="Private" disabled />
            </RadioGroup>,
        );

        const disabledRadio = screen.getByRole("radio", { name: "Private" });
        expect(disabledRadio).toBeDisabled();

        await userEvent.click(disabledRadio, { pointerEventsCheck: 0 });

        expect(disabledRadio).not.toBeChecked();
        expect(onValueChange.mock.calls).toEqual([]);
    });

    test("marks the group required without marking the individual options", () => {
        renderGroup({ required: true });

        expect(screen.getByRole("radiogroup", { name: "Visibility" })).toHaveAttribute("aria-required", "true");
        expect(screen.getByRole("radio", { name: "Public" })).not.toHaveAttribute("aria-required");
    });

    test("is named by a label associated through htmlFor", () => {
        render(
            <RadioGroup aria-label="Visibility">
                <label htmlFor="public-option">Anyone can see this</label>
                <RadioGroupItem id="public-option" value="public" />
            </RadioGroup>,
        );

        expect(screen.getByRole("radio", { name: "Anyone can see this" })).toBeInTheDocument();
    });

    test("merges custom classes with the base classes on the group and its options", () => {
        render(
            <RadioGroup aria-label="Visibility" className="group-class">
                <RadioGroupItem value="public" aria-label="Public" className="item-class" />
            </RadioGroup>,
        );

        expect(screen.getByRole("radiogroup", { name: "Visibility" })).toHaveClass("group-class", "grid", "gap-2");
        expect(screen.getByRole("radio", { name: "Public" })).toHaveClass("item-class", "rounded-full", "aspect-square");
    });

    test("forwards refs to the group and option elements", () => {
        let group: HTMLDivElement | null = null;
        let item: HTMLButtonElement | null = null;
        render(
            <RadioGroup aria-label="Visibility" ref={(node) => {
                group = node;
            }}>
                <RadioGroupItem value="public" aria-label="Public" ref={(node) => {
                item = node;
            }} />
            </RadioGroup>,
        );

        expect((group as unknown as HTMLDivElement).tagName).toBe("DIV");
        expect((item as unknown as HTMLButtonElement).tagName).toBe("BUTTON");
    });

    test("renders a hidden radio input per option inside a form and marks them required", () => {
        render(
            <form>
                <RadioGroup aria-label="Visibility" name="visibility" required defaultValue="public">
                    <RadioGroupItem value="public" aria-label="Public" />
                    <RadioGroupItem value="private" aria-label="Private" />
                </RadioGroup>
            </form>,
        );

        const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('input[name="visibility"]'));
        expect(inputs).toHaveLength(2);
        expect(inputs.every((input) => input.type === "radio" && input.required)).toBe(true);
        expect(inputs[0].checked).toBe(true);
        expect(inputs[1].checked).toBe(false);
    });

    test("renders no hidden inputs when used outside a form", () => {
        renderGroup({ name: "visibility" });

        expect(document.querySelectorAll('input[name="visibility"]')).toHaveLength(0);
    });

    test("submits the selected value with the surrounding form", async () => {
        let submitted: FormDataEntryValue | null = null;
        render(
            <form
                onSubmit={(event) => {
                    event.preventDefault();
                    submitted = new FormData(event.currentTarget).get("visibility");
                }}
            >
                <RadioGroup aria-label="Visibility" name="visibility">
                    <RadioGroupItem value="public" aria-label="Public" />
                    <RadioGroupItem value="private" aria-label="Private" />
                </RadioGroup>
                <button type="submit">Save</button>
            </form>,
        );

        await userEvent.click(screen.getByRole("radio", { name: "Private" }));
        await userEvent.click(screen.getByRole("button", { name: "Save" }));

        expect(submitted).toBe("private");
    });
});
