import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { focusElement } from "@/test/react-act";
import { ToggleGroup, ToggleGroupItem } from "./toggle-group";

type SingleGroupProps = {
    value?: string;
    defaultValue?: string;
    disabled?: boolean;
    onValueChange?: (value: string) => void;
};

const renderSingleGroup = (props: SingleGroupProps = {}) =>
    render(
        <ToggleGroup type="single" {...props}>
            <ToggleGroupItem value="bold" aria-label="Bold">
                B
            </ToggleGroupItem>
            <ToggleGroupItem value="italic" aria-label="Italic">
                I
            </ToggleGroupItem>
            <ToggleGroupItem value="underline" aria-label="Underline" disabled>
                U
            </ToggleGroupItem>
        </ToggleGroup>,
    );

describe("ToggleGroup", () => {
    test("renders the items as radios inside a group when the type is single", () => {
        const { container } = renderSingleGroup();

        expect(container.firstElementChild).toHaveAttribute("role", "group");
        expect(screen.getAllByRole("radio").map((item) => item.getAttribute("aria-label"))).toEqual([
            "Bold",
            "Italic",
            "Underline",
        ]);
    });

    test("presses the item named by defaultValue", () => {
        renderSingleGroup({ defaultValue: "italic" });

        expect(screen.getByRole("radio", { name: "Italic" })).toHaveAttribute("aria-checked", "true");
        expect(screen.getByRole("radio", { name: "Italic" })).toHaveAttribute("data-state", "on");
        expect(screen.getByRole("radio", { name: "Bold" })).toHaveAttribute("data-state", "off");
    });

    test("turns an item on when it is clicked and reports its value", async () => {
        const changes: string[] = [];
        renderSingleGroup({ onValueChange: (value) => changes.push(value) });

        await userEvent.click(screen.getByRole("radio", { name: "Bold" }));

        expect(screen.getByRole("radio", { name: "Bold" })).toHaveAttribute("data-state", "on");
        expect(changes).toEqual(["bold"]);
    });

    test("keeps only one item on at a time in single mode", async () => {
        renderSingleGroup({ defaultValue: "bold" });

        await userEvent.click(screen.getByRole("radio", { name: "Italic" }));

        expect(screen.getByRole("radio", { name: "Bold" })).toHaveAttribute("data-state", "off");
        expect(screen.getByRole("radio", { name: "Italic" })).toHaveAttribute("data-state", "on");
    });

    test("turns the pressed item off again and reports an empty value", async () => {
        const changes: string[] = [];
        renderSingleGroup({ defaultValue: "bold", onValueChange: (value) => changes.push(value) });

        await userEvent.click(screen.getByRole("radio", { name: "Bold" }));

        expect(screen.getByRole("radio", { name: "Bold" })).toHaveAttribute("data-state", "off");
        expect(changes).toEqual([""]);
    });

    test("ignores clicks when the whole group is disabled", async () => {
        const changes: string[] = [];
        renderSingleGroup({ disabled: true, onValueChange: (value) => changes.push(value) });
        const bold = screen.getByRole("radio", { name: "Bold" });

        expect(bold).toBeDisabled();
        await userEvent.click(bold, { pointerEventsCheck: 0 });

        expect(changes).toEqual([]);
        expect(bold).toHaveAttribute("data-state", "off");
    });

    test("ignores clicks on a single disabled item while the others stay usable", async () => {
        const changes: string[] = [];
        renderSingleGroup({ onValueChange: (value) => changes.push(value) });

        await userEvent.click(screen.getByRole("radio", { name: "Underline" }), { pointerEventsCheck: 0 });
        await userEvent.click(screen.getByRole("radio", { name: "Bold" }));

        expect(changes).toEqual(["bold"]);
        expect(screen.getByRole("radio", { name: "Underline" })).toHaveAttribute("data-state", "off");
    });

    test("keeps a controlled value unchanged while still reporting the click", async () => {
        const changes: string[] = [];
        renderSingleGroup({ value: "bold", onValueChange: (value) => changes.push(value) });

        await userEvent.click(screen.getByRole("radio", { name: "Italic" }));

        expect(screen.getByRole("radio", { name: "Bold" })).toHaveAttribute("data-state", "on");
        expect(screen.getByRole("radio", { name: "Italic" })).toHaveAttribute("data-state", "off");
        expect(changes).toEqual(["italic"]);
    });

    test("moves focus between the items with the arrow keys", async () => {
        renderSingleGroup();
        await focusElement(screen.getByRole("radio", { name: "Bold" }));

        await userEvent.keyboard("{ArrowRight}");

        expect(screen.getByRole("radio", { name: "Italic" })).toHaveFocus();
    });

    test("renders toggle buttons that can be pressed together when the type is multiple", async () => {
        const changes: string[][] = [];
        render(
            <ToggleGroup type="multiple" onValueChange={(value) => changes.push(value)}>
                <ToggleGroupItem value="bold" aria-label="Bold">
                    B
                </ToggleGroupItem>
                <ToggleGroupItem value="italic" aria-label="Italic">
                    I
                </ToggleGroupItem>
            </ToggleGroup>,
        );

        expect(screen.queryAllByRole("radio")).toHaveLength(0);
        const bold = screen.getByRole("button", { name: "Bold" });
        expect(bold).toHaveAttribute("aria-pressed", "false");

        await userEvent.click(bold);
        await userEvent.click(screen.getByRole("button", { name: "Italic" }));

        expect(bold).toHaveAttribute("aria-pressed", "true");
        expect(screen.getByRole("button", { name: "Italic" })).toHaveAttribute("aria-pressed", "true");
        expect(changes).toEqual([["bold"], ["bold", "italic"]]);
    });

    test("removes a value from the array when a pressed item is clicked again", async () => {
        const changes: string[][] = [];
        render(
            <ToggleGroup type="multiple" defaultValue={["bold", "italic"]} onValueChange={(value) => changes.push(value)}>
                <ToggleGroupItem value="bold" aria-label="Bold">
                    B
                </ToggleGroupItem>
                <ToggleGroupItem value="italic" aria-label="Italic">
                    I
                </ToggleGroupItem>
            </ToggleGroup>,
        );

        await userEvent.click(screen.getByRole("button", { name: "Bold" }));

        expect(changes).toEqual([["italic"]]);
        expect(screen.getByRole("button", { name: "Bold" })).toHaveAttribute("aria-pressed", "false");
    });

    test("applies the group variant and size to every item", () => {
        render(
            <ToggleGroup type="single" variant="outline" size="sm">
                <ToggleGroupItem value="bold" aria-label="Bold">
                    B
                </ToggleGroupItem>
            </ToggleGroup>,
        );

        expect(screen.getByRole("radio", { name: "Bold" })).toHaveClass("border", "border-input", "h-9", "px-2.5");
    });

    test("lets an item choose its own variant and size when the group sets none", () => {
        render(
            <ToggleGroup type="single">
                <ToggleGroupItem value="bold" aria-label="Bold" variant="outline" size="lg">
                    B
                </ToggleGroupItem>
            </ToggleGroup>,
        );

        expect(screen.getByRole("radio", { name: "Bold" })).toHaveClass("border-input", "h-11", "px-5");
    });

    test("lets the group variant win over an item that asks for another one", () => {
        render(
            <ToggleGroup type="single" variant="outline" size="sm">
                <ToggleGroupItem value="bold" aria-label="Bold" variant="default" size="lg">
                    B
                </ToggleGroupItem>
            </ToggleGroup>,
        );

        const bold = screen.getByRole("radio", { name: "Bold" });
        expect(bold).toHaveClass("border-input", "h-9", "px-2.5");
        expect(bold).not.toHaveClass("h-11", "px-5");
    });

    test("merges custom classes on the root and on an item", () => {
        const { container } = render(
            <ToggleGroup type="single" className="group-class">
                <ToggleGroupItem value="bold" aria-label="Bold" className="item-class">
                    B
                </ToggleGroupItem>
            </ToggleGroup>,
        );

        expect(container.firstElementChild).toHaveClass("group-class", "items-center", "gap-1");
        expect(screen.getByRole("radio", { name: "Bold" })).toHaveClass("item-class", "inline-flex");
    });

    test("renders an empty group without any items", () => {
        const { container } = render(<ToggleGroup type="single" />);

        expect(container.firstElementChild).toHaveAttribute("role", "group");
        expect(screen.queryAllByRole("radio")).toHaveLength(0);
    });

    test("renders the item children so icons or labels stay visible", () => {
        render(
            <ToggleGroup type="single">
                <ToggleGroupItem value="bold" aria-label="Bold">
                    <span data-testid="icon">B</span>
                </ToggleGroupItem>
            </ToggleGroup>,
        );

        expect(screen.getByTestId("icon")).toBeInTheDocument();
        expect(screen.getByRole("radio", { name: "Bold" })).toContainElement(screen.getByTestId("icon"));
    });
});
