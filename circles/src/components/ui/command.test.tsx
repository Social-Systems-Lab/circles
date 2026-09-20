import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
    Command,
    CommandDialog,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
    CommandSeparator,
    CommandShortcut,
} from "./command";

const renderCommand = (onSelect?: (value: string) => void) =>
    render(
        <Command>
            <CommandInput placeholder="Search circles" />
            <CommandList>
                <CommandEmpty>No results found.</CommandEmpty>
                <CommandGroup heading="Circles">
                    <CommandItem value="gardening" onSelect={onSelect}>
                        Gardening
                    </CommandItem>
                    <CommandItem value="governance" onSelect={onSelect}>
                        Governance
                    </CommandItem>
                    <CommandItem value="archived" disabled onSelect={onSelect}>
                        Archived
                    </CommandItem>
                </CommandGroup>
            </CommandList>
        </Command>,
    );

describe("Command", () => {
    test("renders a combobox input wired to the list of options", () => {
        renderCommand();

        const input = screen.getByRole("combobox");
        const list = screen.getByRole("listbox");
        expect(input).toHaveAttribute("aria-controls", list.id);
        expect(input).toHaveAttribute("aria-expanded", "true");
        expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
            "Gardening",
            "Governance",
            "Archived",
        ]);
    });

    test("highlights the first selectable item before anything is typed", () => {
        renderCommand();

        expect(screen.getByRole("option", { name: "Gardening" })).toHaveAttribute("aria-selected", "true");
        expect(screen.getByRole("option", { name: "Governance" })).toHaveAttribute("aria-selected", "false");
    });

    test("filters the items down to the ones matching what is typed", async () => {
        renderCommand();

        await userEvent.type(screen.getByRole("combobox"), "gard");

        expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual(["Gardening"]);
        expect(screen.queryByText("Governance")).toBeNull();
    });

    test("restores every item when the search term is cleared", async () => {
        renderCommand();
        const input = screen.getByRole("combobox");

        await userEvent.type(input, "gard");
        await userEvent.clear(input);

        expect(screen.getAllByRole("option")).toHaveLength(3);
    });

    test("shows the empty state only when nothing matches", async () => {
        renderCommand();

        expect(screen.queryByText("No results found.")).toBeNull();

        await userEvent.type(screen.getByRole("combobox"), "zzzz");

        expect(screen.getByText("No results found.")).toBeInTheDocument();
        expect(screen.queryAllByRole("option")).toHaveLength(0);
    });

    test("calls onSelect with the item value when an item is clicked", async () => {
        const selected: string[] = [];
        renderCommand((value) => selected.push(value));

        await userEvent.click(screen.getByText("Governance"));

        expect(selected).toEqual(["governance"]);
    });

    test("moves the highlight with the arrow keys and selects with Enter", async () => {
        const selected: string[] = [];
        renderCommand((value) => selected.push(value));
        screen.getByRole("combobox").focus();

        await userEvent.keyboard("{ArrowDown}");
        expect(screen.getByRole("option", { name: "Governance" })).toHaveAttribute("aria-selected", "true");

        await userEvent.keyboard("{Enter}");
        expect(selected).toEqual(["governance"]);
    });

    test("selects the only remaining item after filtering", async () => {
        const selected: string[] = [];
        renderCommand((value) => selected.push(value));

        await userEvent.type(screen.getByRole("combobox"), "gov");
        await userEvent.keyboard("{Enter}");

        expect(selected).toEqual(["governance"]);
    });

    test("marks a disabled item and never calls its onSelect", async () => {
        const selected: string[] = [];
        renderCommand((value) => selected.push(value));
        const archived = screen.getByRole("option", { name: "Archived" });

        expect(archived).toHaveAttribute("aria-disabled", "true");
        expect(archived).toHaveAttribute("data-disabled", "true");

        await userEvent.click(archived, { pointerEventsCheck: 0 });

        expect(selected).toEqual([]);
    });

    test("keeps every item visible when filtering is turned off", async () => {
        render(
            <Command shouldFilter={false}>
                <CommandInput placeholder="Search circles" />
                <CommandList>
                    <CommandEmpty>No results found.</CommandEmpty>
                    <CommandItem value="gardening">Gardening</CommandItem>
                    <CommandItem value="governance">Governance</CommandItem>
                </CommandList>
            </Command>,
        );

        await userEvent.type(screen.getByRole("combobox"), "zzzz");

        expect(screen.getAllByRole("option")).toHaveLength(2);
        expect(screen.queryByText("No results found.")).toBeNull();
    });

    test("labels the group items with the group heading", () => {
        renderCommand();

        const heading = screen.getByText("Circles");
        const group = screen.getByRole("group");
        expect(group).toHaveAttribute("aria-labelledby", heading.id);
        expect(heading).toHaveAttribute("aria-hidden", "true");
    });

    test("hides a group whose items are all filtered out", async () => {
        render(
            <Command>
                <CommandInput placeholder="Search circles" />
                <CommandList>
                    <CommandGroup heading="Circles">
                        <CommandItem value="gardening">Gardening</CommandItem>
                    </CommandGroup>
                    <CommandGroup heading="Actions">
                        <CommandItem value="invite">Invite</CommandItem>
                    </CommandGroup>
                </CommandList>
            </Command>,
        );

        await userEvent.type(screen.getByRole("combobox"), "gard");

        expect(screen.getByText("Circles")).toBeInTheDocument();
        expect(screen.getByText("Actions").closest("[cmdk-group]")).toHaveAttribute("hidden");
    });

    test("renders a shortcut hint next to an item", () => {
        render(
            <Command>
                <CommandList>
                    <CommandItem value="invite">
                        Invite <CommandShortcut>⌘I</CommandShortcut>
                    </CommandItem>
                </CommandList>
            </Command>,
        );

        const shortcut = screen.getByText("⌘I");
        expect(shortcut.tagName).toBe("SPAN");
        expect(shortcut).toHaveClass("ml-auto", "tracking-widest");
    });

    test("merges custom classes on the root, the input, the list, an item and a separator", () => {
        const { container } = render(
            <Command className="command-class">
                <CommandInput placeholder="Search" className="input-class" />
                <CommandList className="list-class">
                    <CommandItem value="invite" className="item-class">
                        Invite
                    </CommandItem>
                    <CommandSeparator className="separator-class" />
                </CommandList>
            </Command>,
        );

        expect(container.firstElementChild).toHaveClass("command-class", "flex-col");
        expect(screen.getByRole("combobox")).toHaveClass("input-class", "bg-transparent");
        expect(screen.getByRole("listbox")).toHaveClass("list-class", "overflow-y-auto");
        expect(screen.getByRole("option")).toHaveClass("item-class", "select-none");
        expect(container.querySelector(".separator-class")).toHaveClass("bg-border");
    });

    test("replaces rather than merges the base classes of the empty state", async () => {
        render(
            <Command>
                <CommandInput placeholder="Search" />
                <CommandList>
                    <CommandEmpty className="empty-class">Nothing here</CommandEmpty>
                    <CommandItem value="invite">Invite</CommandItem>
                </CommandList>
            </Command>,
        );

        await userEvent.type(screen.getByRole("combobox"), "zzzz");

        const empty = screen.getByText("Nothing here");
        expect(empty).toHaveClass("empty-class");
        expect(empty).not.toHaveClass("text-center");
    });

    test("renders an empty list without any item", () => {
        render(
            <Command>
                <CommandInput placeholder="Search" />
                <CommandList />
            </Command>,
        );

        expect(screen.getByRole("listbox")).toBeInTheDocument();
        expect(screen.queryAllByRole("option")).toHaveLength(0);
    });
});

describe("CommandDialog", () => {
    test("renders nothing while it is closed", () => {
        render(
            <CommandDialog open={false}>
                <CommandInput placeholder="Type a command" />
                <CommandList>
                    <CommandItem value="invite">Invite</CommandItem>
                </CommandList>
            </CommandDialog>,
        );

        expect(screen.queryByRole("dialog")).toBeNull();
        expect(screen.queryByPlaceholderText("Type a command")).toBeNull();
    });

    test("renders the command inside a dialog when it is open", () => {
        render(
            <CommandDialog open>
                <CommandInput placeholder="Type a command" />
                <CommandList>
                    <CommandItem value="invite">Invite</CommandItem>
                </CommandList>
            </CommandDialog>,
        );

        const dialog = screen.getByRole("dialog");
        expect(dialog).toContainElement(screen.getByPlaceholderText("Type a command"));
        expect(screen.getByRole("option", { name: "Invite" })).toBeInTheDocument();
    });

    test("filters the items shown inside the dialog", async () => {
        render(
            <CommandDialog open>
                <CommandInput placeholder="Type a command" />
                <CommandList>
                    <CommandEmpty>No results found.</CommandEmpty>
                    <CommandItem value="invite">Invite</CommandItem>
                    <CommandItem value="leave">Leave</CommandItem>
                </CommandList>
            </CommandDialog>,
        );

        await userEvent.type(screen.getByPlaceholderText("Type a command"), "inv");

        expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual(["Invite"]);
    });

    test("reports a close request through onOpenChange", async () => {
        const opens: boolean[] = [];
        render(
            <CommandDialog open onOpenChange={(open) => opens.push(open)}>
                <CommandInput placeholder="Type a command" />
                <CommandList>
                    <CommandItem value="invite">Invite</CommandItem>
                </CommandList>
            </CommandDialog>,
        );

        await userEvent.keyboard("{Escape}");

        expect(opens).toEqual([false]);
    });
});
