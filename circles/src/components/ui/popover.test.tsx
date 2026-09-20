import { describe, expect, test } from "bun:test";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

const renderPopover = (props: Partial<React.ComponentProps<typeof Popover>> = {}) =>
    render(
        <div>
            <button type="button">Outside the popover</button>
            <Popover {...props}>
                <PopoverTrigger>Pick a date</PopoverTrigger>
                <PopoverContent>
                    <button type="button">Today</button>
                </PopoverContent>
            </Popover>
        </div>,
    );

describe("Popover", () => {
    test("keeps the content out of the document until the trigger is clicked", () => {
        renderPopover();

        expect(screen.queryByRole("dialog")).toBeNull();
        expect(screen.queryByRole("button", { name: "Today" })).toBeNull();
    });

    test("describes the trigger as a dialog opener", () => {
        renderPopover();

        const trigger = screen.getByRole("button", { name: "Pick a date" });
        expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
        expect(trigger).toHaveAttribute("aria-expanded", "false");
        expect(trigger).toHaveAttribute("data-state", "closed");
    });

    test("opens the content when the trigger is clicked", async () => {
        renderPopover();

        await userEvent.click(screen.getByRole("button", { name: "Pick a date" }));

        const content = await screen.findByRole("dialog");
        expect(content).toHaveAttribute("data-state", "open");
        expect(screen.getByRole("button", { name: "Pick a date" })).toHaveAttribute("aria-expanded", "true");
    });

    test("closes again when the trigger is clicked a second time", async () => {
        renderPopover();
        const trigger = screen.getByRole("button", { name: "Pick a date" });

        await userEvent.click(trigger);
        await screen.findByRole("dialog");
        await userEvent.click(trigger);

        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    });

    test("renders the content in a portal outside the rendered tree", async () => {
        const { container } = renderPopover({ defaultOpen: true });

        const content = await screen.findByRole("dialog");
        expect(container).not.toContainElement(content);
        expect(document.body).toContainElement(content);
    });

    test("points the trigger at the content it controls", async () => {
        renderPopover();
        const trigger = screen.getByRole("button", { name: "Pick a date" });

        await userEvent.click(trigger);

        const content = await screen.findByRole("dialog");
        expect(trigger.getAttribute("aria-controls")).toBe(content.id);
    });

    test("closes when Escape is pressed", async () => {
        renderPopover({ defaultOpen: true });

        await screen.findByRole("dialog");
        await userEvent.keyboard("{Escape}");

        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    });

    test("closes when something outside the popover is clicked", async () => {
        renderPopover({ defaultOpen: true });

        await screen.findByRole("dialog");
        await userEvent.click(screen.getByRole("button", { name: "Outside the popover" }));

        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    });

    test("stays open when something inside the popover is clicked", async () => {
        renderPopover({ defaultOpen: true });

        await screen.findByRole("dialog");
        await userEvent.click(screen.getByRole("button", { name: "Today" }));

        expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    test("reports both open and close through onOpenChange", async () => {
        const changes: boolean[] = [];
        renderPopover({ onOpenChange: (open) => changes.push(open) });

        await userEvent.click(screen.getByRole("button", { name: "Pick a date" }));
        await screen.findByRole("dialog");
        await userEvent.keyboard("{Escape}");

        await waitFor(() => expect(changes).toEqual([true, false]));
    });

    test("starts open when defaultOpen is set", async () => {
        renderPopover({ defaultOpen: true });

        expect(await screen.findByRole("dialog")).toBeInTheDocument();
    });

    test("stays open while controlled even after Escape is pressed", async () => {
        const changes: boolean[] = [];
        renderPopover({ open: true, onOpenChange: (open) => changes.push(open) });

        await screen.findByRole("dialog");
        await userEvent.keyboard("{Escape}");

        expect(changes).toEqual([false]);
        expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    test("ignores trigger clicks while the open prop is controlled to false", async () => {
        const changes: boolean[] = [];
        renderPopover({ open: false, onOpenChange: (open) => changes.push(open) });

        await userEvent.click(screen.getByRole("button", { name: "Pick a date" }));

        expect(changes).toEqual([true]);
        expect(screen.queryByRole("dialog")).toBeNull();
    });

    test("moves focus into the content when it opens", async () => {
        renderPopover();

        await userEvent.click(screen.getByRole("button", { name: "Pick a date" }));

        const content = await screen.findByRole("dialog");
        await waitFor(() => expect(content).toContainElement(document.activeElement as HTMLElement));
    });

    test("returns focus to the trigger when the popover closes", async () => {
        renderPopover();
        const trigger = screen.getByRole("button", { name: "Pick a date" });

        await userEvent.click(trigger);
        await screen.findByRole("dialog");
        await userEvent.keyboard("{Escape}");

        await waitFor(() => expect(trigger).toHaveFocus());
    });

    // The popover is non modal by default, so the page behind it stays interactive and visible
    // to assistive technology, unlike Dialog.
    test("leaves the rest of the page interactive while open", async () => {
        renderPopover({ defaultOpen: true });

        await screen.findByRole("dialog");

        expect(screen.getByRole("button", { name: "Outside the popover" })).toBeInTheDocument();
        expect(document.body.style.pointerEvents).not.toBe("none");
    });

    test("renders the child element instead of a button when the trigger uses asChild", () => {
        render(
            <Popover>
                <PopoverTrigger asChild>
                    <a href="/calendar">Pick a date</a>
                </PopoverTrigger>
                <PopoverContent>Calendar</PopoverContent>
            </Popover>,
        );

        const link = screen.getByRole("link", { name: "Pick a date" });
        expect(link.tagName).toBe("A");
        expect(link).toHaveAttribute("aria-haspopup", "dialog");
    });

    test("merges custom classes into the content", async () => {
        render(
            <Popover defaultOpen>
                <PopoverTrigger>Pick a date</PopoverTrigger>
                <PopoverContent className="content-class">Calendar</PopoverContent>
            </Popover>,
        );

        const content = await screen.findByRole("dialog");
        expect(content).toHaveClass("content-class", "rounded-md", "border");
    });

    test("defaults the content to centre alignment", async () => {
        renderPopover({ defaultOpen: true });

        const content = await screen.findByRole("dialog");
        expect(content).toHaveAttribute("data-align", "center");
    });

    test("forwards a non default align to the content", async () => {
        render(
            <Popover defaultOpen>
                <PopoverTrigger>Pick a date</PopoverTrigger>
                <PopoverContent align="start">Calendar</PopoverContent>
            </Popover>,
        );

        const content = await screen.findByRole("dialog");
        expect(content).toHaveAttribute("data-align", "start");
    });

    test("wraps the content in a positioned popper element", async () => {
        renderPopover({ defaultOpen: true });

        const content = await screen.findByRole("dialog");
        expect(content.parentElement).toHaveAttribute("data-radix-popper-content-wrapper");
    });

    test("forwards a ref to the content element", async () => {
        let captured: HTMLElement | null = null;
        render(
            <Popover defaultOpen>
                <PopoverTrigger>Pick a date</PopoverTrigger>
                <PopoverContent
                    ref={(node) => {
                        captured = node;
                    }}
                >
                    Calendar
                </PopoverContent>
            </Popover>,
        );

        const content = await screen.findByRole("dialog");
        expect(captured).toBe(content as never);
    });
});
