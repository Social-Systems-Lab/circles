import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./collapsible";

const renderCollapsible = (props: Partial<React.ComponentProps<typeof Collapsible>> = {}) =>
    render(
        <Collapsible {...props}>
            <CollapsibleTrigger>Show members</CollapsibleTrigger>
            <CollapsibleContent>Ada, Grace and Alan</CollapsibleContent>
        </Collapsible>,
    );

describe("Collapsible", () => {
    test("hides the content until the trigger is clicked", () => {
        renderCollapsible();

        expect(screen.queryByText("Ada, Grace and Alan")).toBeNull();
        expect(screen.getByRole("button", { name: "Show members" })).toHaveAttribute("aria-expanded", "false");
    });

    // The panel element itself stays in the document while closed; only its children are removed
    // and the wrapper is marked `hidden`.
    test("keeps an empty hidden panel in the document while closed", () => {
        renderCollapsible();
        const trigger = screen.getByRole("button", { name: "Show members" });

        const panel = document.getElementById(trigger.getAttribute("aria-controls") ?? "");
        expect(panel).not.toBeNull();
        expect(panel).toHaveAttribute("hidden");
        expect(panel).toBeEmptyDOMElement();
    });

    test("reveals the content when the trigger is clicked", async () => {
        renderCollapsible();
        const trigger = screen.getByRole("button", { name: "Show members" });

        await userEvent.click(trigger);

        expect(screen.getByText("Ada, Grace and Alan")).toBeInTheDocument();
        expect(trigger).toHaveAttribute("aria-expanded", "true");
    });

    test("hides the content again when the trigger is clicked a second time", async () => {
        renderCollapsible();
        const trigger = screen.getByRole("button", { name: "Show members" });

        await userEvent.click(trigger);
        await userEvent.click(trigger);

        expect(screen.queryByText("Ada, Grace and Alan")).toBeNull();
        expect(trigger).toHaveAttribute("aria-expanded", "false");
    });

    test("links the trigger to the panel it controls", async () => {
        renderCollapsible();
        const trigger = screen.getByRole("button", { name: "Show members" });

        await userEvent.click(trigger);

        const panel = document.getElementById(trigger.getAttribute("aria-controls") ?? "");
        expect(panel).toHaveTextContent("Ada, Grace and Alan");
        expect(panel).not.toHaveAttribute("hidden");
    });

    test("renders the trigger as a real button", () => {
        renderCollapsible();

        const trigger = screen.getByRole("button", { name: "Show members" });
        expect(trigger.tagName).toBe("BUTTON");
        expect(trigger).toHaveAttribute("type", "button");
    });

    test("toggles with the keyboard", async () => {
        renderCollapsible();
        const trigger = screen.getByRole("button", { name: "Show members" });

        await userEvent.tab();
        await userEvent.keyboard("{Enter}");

        expect(trigger).toHaveAttribute("aria-expanded", "true");

        await userEvent.keyboard(" ");

        expect(trigger).toHaveAttribute("aria-expanded", "false");
    });

    test("starts expanded when defaultOpen is set", () => {
        renderCollapsible({ defaultOpen: true });

        expect(screen.getByText("Ada, Grace and Alan")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Show members" })).toHaveAttribute("aria-expanded", "true");
    });

    test("reports both open and close through onOpenChange", async () => {
        const changes: boolean[] = [];
        renderCollapsible({ onOpenChange: (open) => changes.push(open) });
        const trigger = screen.getByRole("button", { name: "Show members" });

        await userEvent.click(trigger);
        await userEvent.click(trigger);

        expect(changes).toEqual([true, false]);
    });

    test("stays closed while the open prop is controlled to false", async () => {
        const changes: boolean[] = [];
        renderCollapsible({ open: false, onOpenChange: (open) => changes.push(open) });

        await userEvent.click(screen.getByRole("button", { name: "Show members" }));

        expect(changes).toEqual([true]);
        expect(screen.queryByText("Ada, Grace and Alan")).toBeNull();
    });

    test("stays open while the open prop is controlled to true", async () => {
        const changes: boolean[] = [];
        renderCollapsible({ open: true, onOpenChange: (open) => changes.push(open) });

        await userEvent.click(screen.getByRole("button", { name: "Show members" }));

        expect(changes).toEqual([false]);
        expect(screen.getByText("Ada, Grace and Alan")).toBeInTheDocument();
    });

    test("does not toggle while disabled", async () => {
        renderCollapsible({ disabled: true });
        const trigger = screen.getByRole("button", { name: "Show members" });

        expect(trigger).toBeDisabled();
        await userEvent.click(trigger, { pointerEventsCheck: 0 });

        expect(trigger).toHaveAttribute("aria-expanded", "false");
        expect(screen.queryByText("Ada, Grace and Alan")).toBeNull();
    });

    test("marks root, trigger and panel with matching data-state attributes", async () => {
        const { container } = renderCollapsible();
        const root = container.firstElementChild as HTMLElement;
        const trigger = screen.getByRole("button", { name: "Show members" });
        const panel = document.getElementById(trigger.getAttribute("aria-controls") ?? "") as HTMLElement;

        expect(root).toHaveAttribute("data-state", "closed");
        expect(trigger).toHaveAttribute("data-state", "closed");
        expect(panel).toHaveAttribute("data-state", "closed");

        await userEvent.click(trigger);

        expect(root).toHaveAttribute("data-state", "open");
        expect(trigger).toHaveAttribute("data-state", "open");
        expect(panel).toHaveAttribute("data-state", "open");
    });

    test("marks root, trigger and panel as disabled for styling", () => {
        const { container } = renderCollapsible({ disabled: true });
        const trigger = screen.getByRole("button", { name: "Show members" });

        expect(container.firstElementChild).toHaveAttribute("data-disabled");
        expect(trigger).toHaveAttribute("data-disabled");
        expect(document.getElementById(trigger.getAttribute("aria-controls") ?? "")).toHaveAttribute("data-disabled");
    });

    test("passes custom classes straight through to root, trigger and content", () => {
        const { container } = render(
            <Collapsible defaultOpen className="root-class">
                <CollapsibleTrigger className="trigger-class">Show members</CollapsibleTrigger>
                <CollapsibleContent className="content-class">Ada, Grace and Alan</CollapsibleContent>
            </Collapsible>,
        );

        expect(container.firstElementChild).toHaveClass("root-class");
        expect(screen.getByRole("button", { name: "Show members" })).toHaveClass("trigger-class");
        expect(screen.getByText("Ada, Grace and Alan")).toHaveClass("content-class");
    });

    test("renders the child element instead of a button when the trigger uses asChild", async () => {
        render(
            <Collapsible>
                <CollapsibleTrigger asChild>
                    <a href="#members">Show members</a>
                </CollapsibleTrigger>
                <CollapsibleContent>Ada, Grace and Alan</CollapsibleContent>
            </Collapsible>,
        );

        const link = screen.getByRole("link", { name: "Show members" });
        expect(link.tagName).toBe("A");
        expect(link).toHaveAttribute("aria-expanded", "false");

        await userEvent.click(link);

        expect(screen.getByText("Ada, Grace and Alan")).toBeInTheDocument();
    });

    // forceMount hands hiding over to the consumer: the closed panel keeps its children, drops the
    // `hidden` attribute and is only distinguishable by `data-state`, so it renders visibly unless
    // the caller adds their own `data-[state=closed]` styling.
    test("leaves a force mounted panel visible while closed", () => {
        render(
            <Collapsible>
                <CollapsibleTrigger>Show members</CollapsibleTrigger>
                <CollapsibleContent forceMount>Ada, Grace and Alan</CollapsibleContent>
            </Collapsible>,
        );

        const content = screen.getByText("Ada, Grace and Alan");
        expect(content).toHaveAttribute("data-state", "closed");
        expect(content).not.toHaveAttribute("hidden");
        expect(content).toBeVisible();
    });
});
