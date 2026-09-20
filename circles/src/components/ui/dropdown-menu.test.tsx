import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { waitForUi, focusElement, settleFloatingUi } from "@/test/react-act";
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuSeparator,
    DropdownMenuShortcut,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
    DropdownMenuTrigger,
} from "./dropdown-menu";

const renderMenu = (props: Partial<React.ComponentProps<typeof DropdownMenu>> = {}) =>
    render(
        <div>
            <button type="button">Outside the menu</button>
            <DropdownMenu {...props}>
                <DropdownMenuTrigger>Actions</DropdownMenuTrigger>
                <DropdownMenuContent>
                    <DropdownMenuItem>Edit</DropdownMenuItem>
                    <DropdownMenuItem disabled>Archive</DropdownMenuItem>
                    <DropdownMenuItem>Delete</DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>,
    );

describe("DropdownMenu", () => {
    test("keeps the menu out of the document until the trigger is clicked", () => {
        renderMenu();

        expect(screen.queryByRole("menu")).toBeNull();
        expect(screen.queryByRole("menuitem")).toBeNull();
    });

    test("describes the trigger as a menu opener", () => {
        renderMenu();

        const trigger = screen.getByRole("button", { name: "Actions" });
        expect(trigger).toHaveAttribute("aria-haspopup", "menu");
        expect(trigger).toHaveAttribute("aria-expanded", "false");
        expect(trigger).toHaveAttribute("data-state", "closed");
    });

    test("opens the menu when the trigger is clicked", async () => {
        renderMenu();
        // Captured up front: the open menu is modal, so Radix hides the rest of the page with
        // `aria-hidden` and the trigger drops out of role queries.
        const trigger = screen.getByRole("button", { name: "Actions" });

        await userEvent.click(trigger);

        const menu = await screen.findByRole("menu");
        expect(menu).toHaveAttribute("data-state", "open");
        expect(menu).toHaveAttribute("aria-orientation", "vertical");
        expect(trigger).toHaveAttribute("aria-expanded", "true");
        expect(trigger.getAttribute("aria-controls")).toBe(menu.id);
    });

    test("labels the menu with its trigger", async () => {
        renderMenu();
        const trigger = screen.getByRole("button", { name: "Actions" });

        await userEvent.click(trigger);

        const menu = await screen.findByRole("menu");
        expect(menu.getAttribute("aria-labelledby")).toBe(trigger.id);
    });

    test("renders the menu in a portal outside the rendered tree", async () => {
        const { container } = renderMenu();

        await userEvent.click(screen.getByRole("button", { name: "Actions" }));

        const menu = await screen.findByRole("menu");
        expect(container).not.toContainElement(menu);
        expect(document.body).toContainElement(menu);
    });

    test("renders every entry as a menu item", async () => {
        renderMenu();

        await userEvent.click(screen.getByRole("button", { name: "Actions" }));
        await screen.findByRole("menu");

        expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["Edit", "Archive", "Delete"]);
    });

    test("fires onSelect and closes the menu when an item is clicked", async () => {
        const selected: string[] = [];
        render(
            <DropdownMenu>
                <DropdownMenuTrigger>Actions</DropdownMenuTrigger>
                <DropdownMenuContent>
                    <DropdownMenuItem onSelect={() => selected.push("edit")}>Edit</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => selected.push("delete")}>Delete</DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>,
        );

        await userEvent.click(screen.getByRole("button", { name: "Actions" }));
        await screen.findByRole("menu");
        await userEvent.click(screen.getByRole("menuitem", { name: "Delete" }));

        expect(selected).toEqual(["delete"]);
        await waitForUi(() => expect(screen.queryByRole("menu")).toBeNull());
    });

    test("keeps the menu open when onSelect prevents the default", async () => {
        let selections = 0;
        render(
            <DropdownMenu>
                <DropdownMenuTrigger>Actions</DropdownMenuTrigger>
                <DropdownMenuContent>
                    <DropdownMenuItem
                        onSelect={(event) => {
                            event.preventDefault();
                            selections += 1;
                        }}
                    >
                        Edit
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>,
        );

        await userEvent.click(screen.getByRole("button", { name: "Actions" }));
        await screen.findByRole("menu");
        await userEvent.click(screen.getByRole("menuitem", { name: "Edit" }));

        expect(selections).toBe(1);
        expect(screen.getByRole("menu")).toBeInTheDocument();
    });

    test("marks a disabled item and never selects it", async () => {
        let selections = 0;
        render(
            <DropdownMenu>
                <DropdownMenuTrigger>Actions</DropdownMenuTrigger>
                <DropdownMenuContent>
                    <DropdownMenuItem disabled onSelect={() => (selections += 1)}>
                        Archive
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>,
        );

        await userEvent.click(screen.getByRole("button", { name: "Actions" }));
        await screen.findByRole("menu");
        const item = screen.getByRole("menuitem", { name: "Archive" });
        expect(item).toHaveAttribute("aria-disabled", "true");
        expect(item).toHaveAttribute("data-disabled");

        await userEvent.click(item, { pointerEventsCheck: 0 });

        expect(selections).toBe(0);
        expect(screen.getByRole("menu")).toBeInTheDocument();
    });

    test("opens from the keyboard with the first item focused", async () => {
        renderMenu();
        const trigger = screen.getByRole("button", { name: "Actions" });

        trigger.focus();
        await userEvent.keyboard("{Enter}");

        await screen.findByRole("menu");
        await waitForUi(() => expect(screen.getByRole("menuitem", { name: "Edit" })).toHaveFocus());
    });

    test("moves focus down the list with the arrow keys and skips disabled items", async () => {
        renderMenu();

        await userEvent.click(screen.getByRole("button", { name: "Actions" }));
        await screen.findByRole("menu");

        await userEvent.keyboard("{ArrowDown}");
        expect(screen.getByRole("menuitem", { name: "Edit" })).toHaveFocus();

        await userEvent.keyboard("{ArrowDown}");
        expect(screen.getByRole("menuitem", { name: "Delete" })).toHaveFocus();
    });

    test("moves focus back up the list with the arrow keys", async () => {
        renderMenu();

        await userEvent.click(screen.getByRole("button", { name: "Actions" }));
        await screen.findByRole("menu");

        await userEvent.keyboard("{ArrowDown}{ArrowDown}{ArrowUp}");

        expect(screen.getByRole("menuitem", { name: "Edit" })).toHaveFocus();
    });

    test("selects the focused item with Enter", async () => {
        const selected: string[] = [];
        render(
            <DropdownMenu>
                <DropdownMenuTrigger>Actions</DropdownMenuTrigger>
                <DropdownMenuContent>
                    <DropdownMenuItem onSelect={() => selected.push("edit")}>Edit</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => selected.push("delete")}>Delete</DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>,
        );

        await userEvent.click(screen.getByRole("button", { name: "Actions" }));
        await screen.findByRole("menu");
        await userEvent.keyboard("{ArrowDown}{ArrowDown}{Enter}");

        expect(selected).toEqual(["delete"]);
        await waitForUi(() => expect(screen.queryByRole("menu")).toBeNull());
    });

    test("closes when Escape is pressed and returns focus to the trigger", async () => {
        renderMenu();
        const trigger = screen.getByRole("button", { name: "Actions" });

        await userEvent.click(trigger);
        await screen.findByRole("menu");
        await userEvent.keyboard("{Escape}");

        await waitForUi(() => expect(screen.queryByRole("menu")).toBeNull());
        await waitForUi(() => expect(trigger).toHaveFocus());
    });

    test("closes when something outside the menu is clicked", async () => {
        renderMenu();

        await userEvent.click(screen.getByRole("button", { name: "Actions" }));
        await screen.findByRole("menu");
        await userEvent.click(screen.getByText("Outside the menu"), { pointerEventsCheck: 0 });

        await waitForUi(() => expect(screen.queryByRole("menu")).toBeNull());
    });

    test("reports both open and close through onOpenChange", async () => {
        const changes: boolean[] = [];
        renderMenu({ onOpenChange: (open) => changes.push(open) });

        await userEvent.click(screen.getByRole("button", { name: "Actions" }));
        await screen.findByRole("menu");
        await userEvent.keyboard("{Escape}");

        await waitForUi(() => expect(changes).toEqual([true, false]));
    });

    test("starts open when defaultOpen is set", async () => {
        renderMenu({ defaultOpen: true });

        expect(await screen.findByRole("menu")).toBeInTheDocument();
    });

    test("stays open while controlled even after Escape is pressed", async () => {
        const changes: boolean[] = [];
        renderMenu({ open: true, onOpenChange: (open) => changes.push(open) });

        await screen.findByRole("menu");
        await userEvent.keyboard("{Escape}");

        expect(changes).toEqual([false]);
        expect(screen.getByRole("menu")).toBeInTheDocument();
    });

    test("ignores trigger clicks while the open prop is controlled to false", async () => {
        const changes: boolean[] = [];
        renderMenu({ open: false, onOpenChange: (open) => changes.push(open) });

        await userEvent.click(screen.getByRole("button", { name: "Actions" }));

        expect(changes).toEqual([true]);
        expect(screen.queryByRole("menu")).toBeNull();
    });

    test("blocks the page behind it because the menu is modal by default", async () => {
        renderMenu({ defaultOpen: true });

        await screen.findByRole("menu");

        expect(screen.getByText("Outside the menu").closest("[aria-hidden]")).toHaveAttribute("aria-hidden", "true");
        expect(document.body.style.pointerEvents).toBe("none");
    });

    test("renders the child element instead of a button when the trigger uses asChild", () => {
        render(
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <a href="/actions">Actions</a>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                    <DropdownMenuItem>Edit</DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>,
        );

        const link = screen.getByRole("link", { name: "Actions" });
        expect(link.tagName).toBe("A");
        expect(link).toHaveAttribute("aria-haspopup", "menu");
    });

    test("toggles a checkbox item and reports the new state", async () => {
        const states: boolean[] = [];
        render(
            <DropdownMenu defaultOpen>
                <DropdownMenuTrigger>Actions</DropdownMenuTrigger>
                <DropdownMenuContent>
                    <DropdownMenuCheckboxItem checked={false} onCheckedChange={(next) => states.push(next as boolean)}>
                        Show archived
                    </DropdownMenuCheckboxItem>
                </DropdownMenuContent>
            </DropdownMenu>,
        );

        const item = await screen.findByRole("menuitemcheckbox", { name: "Show archived" });
        expect(item).toHaveAttribute("aria-checked", "false");

        await userEvent.click(item);

        expect(states).toEqual([true]);
    });

    test("shows an indicator only for a checked checkbox item", async () => {
        render(
            <DropdownMenu defaultOpen>
                <DropdownMenuTrigger>Actions</DropdownMenuTrigger>
                <DropdownMenuContent>
                    <DropdownMenuCheckboxItem checked>Show archived</DropdownMenuCheckboxItem>
                    <DropdownMenuCheckboxItem checked={false}>Show drafts</DropdownMenuCheckboxItem>
                </DropdownMenuContent>
            </DropdownMenu>,
        );

        const checked = await screen.findByRole("menuitemcheckbox", { name: "Show archived" });
        const unchecked = screen.getByRole("menuitemcheckbox", { name: "Show drafts" });

        expect(checked).toHaveAttribute("aria-checked", "true");
        expect(checked.querySelector("svg")).not.toBeNull();
        expect(unchecked.querySelector("svg")).toBeNull();
    });

    test("selects a radio item and reports the new value", async () => {
        const values: string[] = [];
        render(
            <DropdownMenu defaultOpen>
                <DropdownMenuTrigger>Actions</DropdownMenuTrigger>
                <DropdownMenuContent>
                    <DropdownMenuRadioGroup value="newest" onValueChange={(value) => values.push(value)}>
                        <DropdownMenuRadioItem value="newest">Newest first</DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="oldest">Oldest first</DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                </DropdownMenuContent>
            </DropdownMenu>,
        );

        const newest = await screen.findByRole("menuitemradio", { name: "Newest first" });
        expect(newest).toHaveAttribute("aria-checked", "true");
        expect(screen.getByRole("menuitemradio", { name: "Oldest first" })).toHaveAttribute("aria-checked", "false");

        await userEvent.click(screen.getByRole("menuitemradio", { name: "Oldest first" }));

        expect(values).toEqual(["oldest"]);
    });

    test("groups items and renders a separator between them", async () => {
        render(
            <DropdownMenu defaultOpen>
                <DropdownMenuTrigger>Actions</DropdownMenuTrigger>
                <DropdownMenuContent>
                    <DropdownMenuLabel>Post</DropdownMenuLabel>
                    <DropdownMenuGroup>
                        <DropdownMenuItem>Edit</DropdownMenuItem>
                    </DropdownMenuGroup>
                    <DropdownMenuSeparator />
                    <DropdownMenuGroup>
                        <DropdownMenuItem>Delete</DropdownMenuItem>
                    </DropdownMenuGroup>
                </DropdownMenuContent>
            </DropdownMenu>,
        );

        await screen.findByRole("menu");

        expect(screen.getAllByRole("group")).toHaveLength(2);
        expect(screen.getByRole("separator")).toHaveAttribute("aria-orientation", "horizontal");
        expect(screen.getByText("Post")).toHaveClass("font-semibold");
    });

    test("opens a submenu from its trigger", async () => {
        render(
            <DropdownMenu defaultOpen>
                <DropdownMenuTrigger>Actions</DropdownMenuTrigger>
                <DropdownMenuContent>
                    <DropdownMenuSub>
                        <DropdownMenuSubTrigger>Move to</DropdownMenuSubTrigger>
                        <DropdownMenuSubContent>
                            <DropdownMenuItem>Archive</DropdownMenuItem>
                        </DropdownMenuSubContent>
                    </DropdownMenuSub>
                </DropdownMenuContent>
            </DropdownMenu>,
        );
        await settleFloatingUi();

        const subTrigger = await screen.findByRole("menuitem", { name: "Move to" });
        expect(subTrigger).toHaveAttribute("aria-haspopup", "menu");
        expect(subTrigger).toHaveAttribute("aria-expanded", "false");

        await focusElement(subTrigger);
        await userEvent.keyboard("{ArrowRight}");

        await waitForUi(() => expect(screen.getAllByRole("menu")).toHaveLength(2));
        expect(subTrigger).toHaveAttribute("aria-expanded", "true");
        expect(screen.getByRole("menuitem", { name: "Archive" })).toBeInTheDocument();
    });

    test("closes a submenu again with the left arrow key", async () => {
        render(
            <DropdownMenu defaultOpen>
                <DropdownMenuTrigger>Actions</DropdownMenuTrigger>
                <DropdownMenuContent>
                    <DropdownMenuSub>
                        <DropdownMenuSubTrigger>Move to</DropdownMenuSubTrigger>
                        <DropdownMenuSubContent>
                            <DropdownMenuItem>Archive</DropdownMenuItem>
                        </DropdownMenuSubContent>
                    </DropdownMenuSub>
                </DropdownMenuContent>
            </DropdownMenu>,
        );
        await settleFloatingUi();

        const subTrigger = await screen.findByRole("menuitem", { name: "Move to" });
        await focusElement(subTrigger);
        await userEvent.keyboard("{ArrowRight}");
        await waitForUi(() => expect(screen.getAllByRole("menu")).toHaveLength(2));
        await userEvent.keyboard("{ArrowLeft}");

        await waitForUi(() => expect(screen.getAllByRole("menu")).toHaveLength(1));
        expect(screen.queryByRole("menuitem", { name: "Archive" })).toBeNull();
    });

    test("insets items, labels and submenu triggers when asked", async () => {
        render(
            <DropdownMenu defaultOpen>
                <DropdownMenuTrigger>Actions</DropdownMenuTrigger>
                <DropdownMenuContent>
                    <DropdownMenuLabel inset>Post</DropdownMenuLabel>
                    <DropdownMenuItem inset>Edit</DropdownMenuItem>
                    <DropdownMenuSub>
                        <DropdownMenuSubTrigger inset>Move to</DropdownMenuSubTrigger>
                        <DropdownMenuSubContent>
                            <DropdownMenuItem>Archive</DropdownMenuItem>
                        </DropdownMenuSubContent>
                    </DropdownMenuSub>
                </DropdownMenuContent>
            </DropdownMenu>,
        );

        await screen.findByRole("menu");

        expect(screen.getByText("Post")).toHaveClass("pl-8");
        expect(screen.getByRole("menuitem", { name: "Edit" })).toHaveClass("pl-8");
        expect(screen.getByRole("menuitem", { name: "Move to" })).toHaveClass("pl-8");
    });

    test("renders a shortcut hint alongside an item", async () => {
        render(
            <DropdownMenu defaultOpen>
                <DropdownMenuTrigger>Actions</DropdownMenuTrigger>
                <DropdownMenuContent>
                    <DropdownMenuItem>
                        Edit
                        <DropdownMenuShortcut className="shortcut-class">⌘E</DropdownMenuShortcut>
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>,
        );

        await screen.findByRole("menu");

        const shortcut = screen.getByText("⌘E");
        expect(shortcut.tagName).toBe("SPAN");
        expect(shortcut).toHaveClass("shortcut-class", "ml-auto", "opacity-60");
    });

    test("merges custom classes into every menu part", async () => {
        render(
            <DropdownMenu defaultOpen>
                <DropdownMenuTrigger>Actions</DropdownMenuTrigger>
                <DropdownMenuContent className="content-class">
                    <DropdownMenuLabel className="label-class">Post</DropdownMenuLabel>
                    <DropdownMenuItem className="item-class">Edit</DropdownMenuItem>
                    <DropdownMenuCheckboxItem className="checkbox-class" checked>
                        Show archived
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuRadioGroup value="newest">
                        <DropdownMenuRadioItem className="radio-class" value="newest">
                            Newest first
                        </DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                    <DropdownMenuSeparator className="separator-class" />
                </DropdownMenuContent>
            </DropdownMenu>,
        );

        const menu = await screen.findByRole("menu");
        expect(menu).toHaveClass("content-class", "rounded-md", "border");
        expect(screen.getByText("Post")).toHaveClass("label-class", "font-semibold");
        expect(screen.getByRole("menuitem", { name: "Edit" })).toHaveClass("item-class", "rounded-sm");
        expect(screen.getByRole("menuitemcheckbox", { name: "Show archived" })).toHaveClass("checkbox-class", "pl-8");
        expect(screen.getByRole("menuitemradio", { name: "Newest first" })).toHaveClass("radio-class", "pl-8");
        expect(screen.getByRole("separator")).toHaveClass("separator-class", "h-px");
    });

    test("merges custom classes into submenu trigger and submenu content", async () => {
        render(
            <DropdownMenu defaultOpen>
                <DropdownMenuTrigger>Actions</DropdownMenuTrigger>
                <DropdownMenuContent>
                    <DropdownMenuSub>
                        <DropdownMenuSubTrigger className="sub-trigger-class">Move to</DropdownMenuSubTrigger>
                        <DropdownMenuSubContent className="sub-content-class">
                            <DropdownMenuItem>Archive</DropdownMenuItem>
                        </DropdownMenuSubContent>
                    </DropdownMenuSub>
                </DropdownMenuContent>
            </DropdownMenu>,
        );
        await settleFloatingUi();

        const subTrigger = await screen.findByRole("menuitem", { name: "Move to" });
        expect(subTrigger).toHaveClass("sub-trigger-class", "rounded-sm");

        await focusElement(subTrigger);
        await userEvent.keyboard("{ArrowRight}");

        const menus = await screen.findAllByRole("menu");
        expect(menus).toHaveLength(2);
        expect(menus[1]).toHaveClass("sub-content-class", "rounded-md");
        await settleFloatingUi();
    });

    test("wraps the menu in a positioned popper element", async () => {
        renderMenu({ defaultOpen: true });

        const menu = await screen.findByRole("menu");
        expect(menu.parentElement).toHaveAttribute("data-radix-popper-content-wrapper");
    });

    test("jumps to an item by typing its first letters", async () => {
        renderMenu();

        await userEvent.click(screen.getByRole("button", { name: "Actions" }));
        await screen.findByRole("menu");
        await userEvent.keyboard("de");

        await waitForUi(() => expect(screen.getByRole("menuitem", { name: "Delete" })).toHaveFocus());
    });
});
