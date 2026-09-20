import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectLabel,
    SelectSeparator,
    SelectTrigger,
    SelectValue,
} from "./select";

const renderSelect = (props: Partial<React.ComponentProps<typeof Select>> = {}) =>
    render(
        <Select {...props}>
            <SelectTrigger aria-label="Fruit">
                <SelectValue placeholder="Pick a fruit" />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="apple">Apple</SelectItem>
                <SelectItem value="banana" disabled>
                    Banana
                </SelectItem>
                <SelectItem value="cherry">Cherry</SelectItem>
            </SelectContent>
        </Select>,
    );

// Radix Select opens reliably from the keyboard in happy-dom, where pointer geometry is unavailable.
const openSelect = async () => {
    const trigger = screen.getByRole("combobox");
    trigger.focus();
    await userEvent.keyboard("{ArrowDown}");
    return trigger;
};

describe("Select", () => {
    test("renders a collapsed combobox showing the placeholder", () => {
        renderSelect();

        const trigger = screen.getByRole("combobox", { name: "Fruit" });
        expect(trigger).toHaveTextContent("Pick a fruit");
        expect(trigger).toHaveAttribute("aria-expanded", "false");
        expect(trigger).toHaveAttribute("data-state", "closed");
        expect(trigger).toHaveAttribute("data-placeholder", "");
    });

    test("keeps the options out of the document while it is closed", () => {
        renderSelect();

        expect(screen.queryAllByRole("option")).toHaveLength(0);
        expect(screen.queryByRole("listbox")).toBeNull();
    });

    test("opens a listbox with every option when the keyboard opens it", async () => {
        renderSelect();

        const trigger = await openSelect();

        expect(trigger).toHaveAttribute("aria-expanded", "true");
        expect(screen.getByRole("listbox")).toBeInTheDocument();
        expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
            "Apple",
            "Banana",
            "Cherry",
        ]);
    });

    test("selects the highlighted option with Enter and reports its value", async () => {
        const changes: string[] = [];
        renderSelect({ onValueChange: (value) => changes.push(value) });

        const trigger = await openSelect();
        await userEvent.keyboard("{Enter}");

        expect(changes).toEqual(["apple"]);
        expect(trigger).toHaveTextContent("Apple");
        expect(trigger).toHaveAttribute("aria-expanded", "false");
    });

    test("skips a disabled option while arrowing through the list", async () => {
        const changes: string[] = [];
        renderSelect({ onValueChange: (value) => changes.push(value) });

        const trigger = await openSelect();
        await userEvent.keyboard("{ArrowDown}");
        await userEvent.keyboard("{Enter}");

        expect(changes).toEqual(["cherry"]);
        expect(trigger).toHaveTextContent("Cherry");
    });

    test("marks a disabled option so it cannot be chosen", async () => {
        renderSelect();

        await openSelect();

        const banana = screen.getByRole("option", { name: "Banana" });
        expect(banana).toHaveAttribute("data-disabled", "");
        expect(banana).toHaveClass("data-[disabled]:pointer-events-none");
    });

    test("shows the label of defaultValue instead of the placeholder", async () => {
        renderSelect({ defaultValue: "cherry" });

        const trigger = screen.getByRole("combobox");
        expect(trigger).toHaveTextContent("Cherry");
        expect(trigger).not.toHaveAttribute("data-placeholder");

        await openSelect();
        expect(screen.getByRole("option", { name: "Cherry" })).toHaveAttribute("aria-selected", "true");
        expect(screen.getByRole("option", { name: "Cherry" })).toHaveAttribute("data-state", "checked");
        expect(screen.getByRole("option", { name: "Apple" })).toHaveAttribute("data-state", "unchecked");
    });

    test("keeps a controlled value unchanged while still reporting the choice", async () => {
        const changes: string[] = [];
        renderSelect({ value: "apple", onValueChange: (value) => changes.push(value) });

        const trigger = await openSelect();
        await userEvent.keyboard("{ArrowDown}");
        await userEvent.keyboard("{Enter}");

        expect(changes).toEqual(["cherry"]);
        expect(trigger).toHaveTextContent("Apple");
    });

    test("closes without selecting anything when Escape is pressed", async () => {
        const changes: string[] = [];
        renderSelect({ onValueChange: (value) => changes.push(value) });

        const trigger = await openSelect();
        await userEvent.keyboard("{Escape}");

        expect(trigger).toHaveAttribute("aria-expanded", "false");
        expect(changes).toEqual([]);
        expect(trigger).toHaveTextContent("Pick a fruit");
    });

    test("reports open state changes through onOpenChange", async () => {
        const opens: boolean[] = [];
        renderSelect({ onOpenChange: (open) => opens.push(open) });

        await openSelect();
        await userEvent.keyboard("{Escape}");

        expect(opens).toEqual([true, false]);
    });

    test("does not open when the select is disabled", async () => {
        render(
            <Select disabled>
                <SelectTrigger aria-label="Fruit">
                    <SelectValue placeholder="Pick a fruit" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="apple">Apple</SelectItem>
                </SelectContent>
            </Select>,
        );
        const trigger = screen.getByRole("combobox");

        expect(trigger).toBeDisabled();
        trigger.focus();
        await userEvent.keyboard("{ArrowDown}");

        expect(trigger).toHaveAttribute("aria-expanded", "false");
        expect(screen.queryAllByRole("option")).toHaveLength(0);
    });

    test("renders groups, labels and separators inside the open content", async () => {
        render(
            <Select>
                <SelectTrigger aria-label="Food">
                    <SelectValue placeholder="Pick food" />
                </SelectTrigger>
                <SelectContent>
                    <SelectGroup>
                        <SelectLabel>Fruit</SelectLabel>
                        <SelectItem value="apple">Apple</SelectItem>
                    </SelectGroup>
                    <SelectSeparator />
                    <SelectGroup>
                        <SelectLabel>Vegetables</SelectLabel>
                        <SelectItem value="kale">Kale</SelectItem>
                    </SelectGroup>
                </SelectContent>
            </Select>,
        );

        await openSelect();

        const groups = screen.getAllByRole("group");
        expect(groups).toHaveLength(2);
        expect(groups[0]).toHaveTextContent("Fruit");
        expect(groups[0]).toHaveAttribute("aria-labelledby", screen.getByText("Fruit").id);
        expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual(["Apple", "Kale"]);
    });

    test("renders a select with a single option", async () => {
        const changes: string[] = [];
        render(
            <Select onValueChange={(value) => changes.push(value)}>
                <SelectTrigger aria-label="Fruit">
                    <SelectValue placeholder="Pick a fruit" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="apple">Apple</SelectItem>
                </SelectContent>
            </Select>,
        );

        const trigger = await openSelect();
        await userEvent.keyboard("{ArrowDown}");
        await userEvent.keyboard("{Enter}");

        expect(changes).toEqual(["apple"]);
        expect(trigger).toHaveTextContent("Apple");
    });

    test("merges custom classes on the trigger, the content, an item, a label and a separator", async () => {
        render(
            <Select>
                <SelectTrigger className="trigger-class" aria-label="Fruit">
                    <SelectValue placeholder="Pick a fruit" />
                </SelectTrigger>
                <SelectContent className="content-class">
                    <SelectGroup>
                        <SelectLabel className="label-class">Fruit</SelectLabel>
                        <SelectItem value="apple" className="item-class">
                            Apple
                        </SelectItem>
                    </SelectGroup>
                    <SelectSeparator className="separator-class" />
                </SelectContent>
            </Select>,
        );

        expect(screen.getByRole("combobox")).toHaveClass("trigger-class", "rounded-md");

        await openSelect();

        expect(screen.getByRole("listbox")).toHaveClass("content-class", "overflow-hidden");
        expect(screen.getByRole("option", { name: "Apple" })).toHaveClass("item-class", "select-none");
        expect(screen.getByText("Fruit")).toHaveClass("label-class", "font-semibold");
        expect(document.querySelector(".separator-class")).toHaveClass("bg-muted");
    });

    test("hides the separator from assistive technology", async () => {
        render(
            <Select>
                <SelectTrigger aria-label="Fruit">
                    <SelectValue placeholder="Pick a fruit" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="apple">Apple</SelectItem>
                    <SelectSeparator data-testid="separator" />
                    <SelectItem value="kale">Kale</SelectItem>
                </SelectContent>
            </Select>,
        );

        await openSelect();

        expect(screen.getByTestId("separator")).toHaveAttribute("aria-hidden", "true");
    });

    test("closes the listbox again after a value has been picked", async () => {
        renderSelect();

        await openSelect();
        await userEvent.keyboard("{Enter}");

        expect(screen.queryByRole("listbox")).toBeNull();
        expect(screen.queryAllByRole("option")).toHaveLength(0);
    });
});
