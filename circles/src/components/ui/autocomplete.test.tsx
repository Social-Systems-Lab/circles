import { describe, expect, test } from "bun:test";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Command as CommandPrimitive } from "cmdk";
import { AutoComplete, LocationInput, type Option } from "./autocomplete";

const options: Option[] = [
    { value: "stockholm", label: "Stockholm, Sweden" },
    { value: "berlin", label: "Berlin, Germany" },
    { value: "nairobi", label: "Nairobi, Kenya" },
];

// LocationInput wraps cmdk's Input, which must sit inside a Command root.
const renderLocationInput = (props: Partial<React.ComponentProps<typeof LocationInput>> = {}) =>
    render(
        <CommandPrimitive>
            <LocationInput isConfirmed={false} value="" onValueChange={() => {}} {...props} />
        </CommandPrimitive>,
    );

const renderAutoComplete = (props: Partial<React.ComponentProps<typeof AutoComplete>> = {}) => {
    const searches: string[] = [];
    const selected: Option[] = [];
    const clears: number[] = [];

    const view = render(
        <AutoComplete
            options={options}
            emptyMessage="No locations found"
            onSearch={(query) => searches.push(query)}
            onValueChange={(value) => selected.push(value)}
            onClear={() => clears.push(1)}
            isLocationConfirmed={false}
            placeholder="Search for a place"
            {...props}
        />,
    );

    return { ...view, searches, selected, clears };
};

describe("LocationInput", () => {
    test("renders an input with the provided placeholder", () => {
        renderLocationInput({ placeholder: "City" });

        expect(screen.getByRole("combobox")).toHaveAttribute("placeholder", "City");
    });

    test("leaves the input with autocomplete disabled after cmdk mounts", () => {
        // LocationInput passes autoComplete="one-time-code" and also tries to force that
        // attribute in an effect, but cmdk rewrites the underlying input to autocomplete="off".
        // Guard the observable DOM result so a change in either layer is noticed.
        renderLocationInput();

        expect(screen.getByRole("combobox").getAttribute("autocomplete")).toBe("off");
    });

    test("shows the filled pin when the location is confirmed", () => {
        const { container } = renderLocationInput({ isConfirmed: true });

        expect(container.querySelector(".text-\\[\\#e54242\\]")).not.toBeNull();
        expect(container.querySelector(".text-gray-400")).toBeNull();
    });

    test("shows the outline pin when the location is not confirmed", () => {
        const { container } = renderLocationInput({ isConfirmed: false });

        expect(container.querySelector(".text-gray-400")).not.toBeNull();
        expect(container.querySelector(".text-\\[\\#e54242\\]")).toBeNull();
    });

    test("shows a clear button only when showClearButton is set", async () => {
        let cleared = 0;
        const { rerender } = render(
            <CommandPrimitive>
                <LocationInput isConfirmed={false} onValueChange={() => {}} />
            </CommandPrimitive>,
        );

        expect(screen.queryByRole("button")).toBeNull();

        rerender(
            <CommandPrimitive>
                <LocationInput
                    isConfirmed
                    showClearButton
                    onValueChange={() => {}}
                    onClear={() => (cleared += 1)}
                />
            </CommandPrimitive>,
        );

        await userEvent.click(screen.getByRole("button"));
        expect(cleared).toBe(1);
    });

    test("does not show the clear button when showClearButton is false even if confirmed", () => {
        renderLocationInput({
            isConfirmed: true,
            showClearButton: false,
            onClear: () => {},
        });

        expect(screen.queryByRole("button")).toBeNull();
    });

    test("forwards disabled to the input", () => {
        renderLocationInput({ disabled: true });

        expect(screen.getByRole("combobox")).toBeDisabled();
    });

    test("merges a custom className onto the input", () => {
        renderLocationInput({ className: "text-base" });

        expect(screen.getByRole("combobox")).toHaveClass("text-base");
    });
});

describe("AutoComplete", () => {
    test("renders the search input with the given placeholder", () => {
        renderAutoComplete();

        expect(screen.getByPlaceholderText("Search for a place")).toBeInTheDocument();
        expect(screen.getByRole("combobox")).toHaveValue("");
    });

    test("keeps the suggestion list hidden until the input is focused", () => {
        const { container } = renderAutoComplete();

        const listWrapper = container.querySelector(".absolute") as HTMLElement;
        expect(listWrapper.className).toContain("hidden");
        expect(listWrapper.className).not.toContain("block");
    });

    test("opens the suggestion list when the input is focused", async () => {
        const { container } = renderAutoComplete();

        await userEvent.click(screen.getByRole("combobox"));

        const listWrapper = container.querySelector(".absolute") as HTMLElement;
        expect(listWrapper.className).toContain("block");
        expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
            "Stockholm, Sweden",
            "Berlin, Germany",
            "Nairobi, Kenya",
        ]);
    });

    test("calls onSearch with every keystroke", async () => {
        const { searches } = renderAutoComplete();

        await userEvent.type(screen.getByRole("combobox"), "Ber");

        expect(searches).toEqual(["B", "Be", "Ber"]);
        expect(screen.getByRole("combobox")).toHaveValue("Ber");
    });

    test("selects an option when it is clicked and closes the list", async () => {
        const { selected, container } = renderAutoComplete();

        await userEvent.click(screen.getByRole("combobox"));
        await userEvent.click(screen.getByText("Berlin, Germany"));

        expect(selected).toEqual([{ value: "berlin", label: "Berlin, Germany" }]);
        expect(screen.getByRole("combobox")).toHaveValue("Berlin, Germany");

        await waitFor(() => {
            expect((container.querySelector(".absolute") as HTMLElement).className).toContain("hidden");
        });
    });

    test("marks the currently selected option with a check icon", async () => {
        // Start with an empty input so cmdk does not filter the list down to the selected label.
        renderAutoComplete();

        await userEvent.click(screen.getByRole("combobox"));
        await userEvent.click(screen.getByText("Stockholm, Sweden"));
        await userEvent.click(screen.getByRole("combobox"));

        const selected = screen.getByRole("option", { name: /Stockholm, Sweden/ });
        expect(selected.querySelector("svg")).not.toBeNull();
        expect(selected.className).not.toContain("pl-8");
    });

    test("selects a matching option when Enter is pressed with an exact label", async () => {
        const { selected } = renderAutoComplete();
        const input = screen.getByRole("combobox");

        await userEvent.click(input);
        await userEvent.clear(input);
        await userEvent.type(input, "Nairobi, Kenya");
        await userEvent.keyboard("{Enter}");

        // cmdk may also fire onSelect for the highlighted item, so the custom Enter path and
        // cmdk's own select can both report the same option — assert it was selected at least once.
        expect(selected.length).toBeGreaterThanOrEqual(1);
        expect(selected.at(-1)).toEqual({ value: "nairobi", label: "Nairobi, Kenya" });
    });

    test("lets cmdk select the highlighted option when Enter is pressed on an empty input", async () => {
        // Today's behavior: our Enter handler bails on empty input, but cmdk still selects the
        // aria-selected option through CommandItem.onSelect.
        const { selected } = renderAutoComplete();

        await userEvent.click(screen.getByRole("combobox"));
        await userEvent.keyboard("{Enter}");

        expect(selected).toEqual([{ value: "stockholm", label: "Stockholm, Sweden" }]);
    });

    test("does not select anything on Enter when the input does not match an option and nothing is highlighted", async () => {
        const { selected } = renderAutoComplete({ options: [] });

        await userEvent.click(screen.getByRole("combobox"));
        await userEvent.type(screen.getByRole("combobox"), "Somewhere else");
        await userEvent.keyboard("{Enter}");

        expect(selected).toEqual([]);
    });

    test("blurs the input when Escape is pressed", async () => {
        renderAutoComplete();
        const input = screen.getByRole("combobox");

        await userEvent.click(input);
        expect(input).toHaveFocus();

        await userEvent.keyboard("{Escape}");

        expect(input).not.toHaveFocus();
    });

    test("shows the empty message when there are no options and nothing is loading", async () => {
        renderAutoComplete({ options: [] });

        await userEvent.click(screen.getByRole("combobox"));

        expect(screen.getByText("No locations found")).toBeInTheDocument();
        expect(screen.queryByRole("option")).toBeNull();
    });

    test("hides options and the empty message while loading and shows a skeleton instead", async () => {
        const { container } = renderAutoComplete({ isLoading: true, options: [] });

        await userEvent.click(screen.getByRole("combobox"));

        expect(screen.queryByText("No locations found")).toBeNull();
        expect(screen.queryByRole("option")).toBeNull();
        expect(container.querySelector(".animate-pulse")).not.toBeNull();
    });

    test("hides the options list while loading even when options are present", async () => {
        renderAutoComplete({ isLoading: true });

        await userEvent.click(screen.getByRole("combobox"));

        expect(screen.queryByRole("option")).toBeNull();
        expect(screen.queryByText("No locations found")).toBeNull();
    });

    test("seeds the input from the controlled value", () => {
        renderAutoComplete({ value: { value: "berlin", label: "Berlin, Germany" } });

        expect(screen.getByRole("combobox")).toHaveValue("Berlin, Germany");
    });

    test("updates the input when the controlled value changes to a different label", () => {
        const { rerender } = render(
            <AutoComplete
                options={options}
                emptyMessage="No locations found"
                onSearch={() => {}}
                isLocationConfirmed={false}
                value={{ value: "stockholm", label: "Stockholm, Sweden" }}
            />,
        );

        expect(screen.getByRole("combobox")).toHaveValue("Stockholm, Sweden");

        rerender(
            <AutoComplete
                options={options}
                emptyMessage="No locations found"
                onSearch={() => {}}
                isLocationConfirmed={false}
                value={{ value: "berlin", label: "Berlin, Germany" }}
            />,
        );

        expect(screen.getByRole("combobox")).toHaveValue("Berlin, Germany");
    });

    test("does not overwrite the typed input when the controlled value label is unchanged", async () => {
        const value = { value: "stockholm", label: "Stockholm, Sweden" };
        const { rerender } = render(
            <AutoComplete
                options={options}
                emptyMessage="No locations found"
                onSearch={() => {}}
                isLocationConfirmed={false}
                value={value}
            />,
        );

        await userEvent.clear(screen.getByRole("combobox"));
        await userEvent.type(screen.getByRole("combobox"), "Stock");

        rerender(
            <AutoComplete
                options={options}
                emptyMessage="No locations found"
                onSearch={() => {}}
                isLocationConfirmed={false}
                value={value}
            />,
        );

        expect(screen.getByRole("combobox")).toHaveValue("Stock");
    });

    test("disables the input when disabled is set", () => {
        renderAutoComplete({ disabled: true });

        expect(screen.getByRole("combobox")).toBeDisabled();
    });

    test("shows the clear button when the location is confirmed and clears through onClear", async () => {
        const { clears } = renderAutoComplete({ isLocationConfirmed: true });

        await userEvent.click(screen.getByRole("button"));

        expect(clears).toEqual([1]);
    });

    test("hides the clear button when the location is not confirmed", () => {
        renderAutoComplete({ isLocationConfirmed: false });

        expect(screen.queryByRole("button")).toBeNull();
    });

    test("closes the suggestion list when the input loses focus", async () => {
        const { container } = renderAutoComplete();

        await userEvent.click(screen.getByRole("combobox"));
        expect((container.querySelector(".absolute") as HTMLElement).className).toContain("block");

        await act(async () => {
            screen.getByRole("combobox").blur();
        });

        expect((container.querySelector(".absolute") as HTMLElement).className).toContain("hidden");
    });

    test("re-opens the list when a key is pressed while it is closed", async () => {
        const { container } = renderAutoComplete();
        const input = screen.getByRole("combobox");

        await userEvent.click(input);
        await act(async () => {
            input.blur();
        });
        expect((container.querySelector(".absolute") as HTMLElement).className).toContain("hidden");

        await userEvent.type(input, "a");

        expect((container.querySelector(".absolute") as HTMLElement).className).toContain("block");
    });

    test("works without onValueChange or onClear callbacks", async () => {
        render(
            <AutoComplete
                options={options}
                emptyMessage="No locations found"
                onSearch={() => {}}
                isLocationConfirmed={false}
            />,
        );

        await userEvent.click(screen.getByRole("combobox"));
        await userEvent.click(screen.getByText("Berlin, Germany"));

        expect(screen.getByRole("combobox")).toHaveValue("Berlin, Germany");
    });
});
