import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { settleFloatingUi, waitForUi } from "@/test/react-act";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./tooltip";

// Radix renders the tooltip twice: the styled popper element the user sees, plus a visually
// hidden copy that carries `role="tooltip"` and the id the trigger points at. The hidden copy is
// the only one with a role, so it is the anchor for every query here.
const getHiddenTooltip = () => screen.getByRole("tooltip");
const getVisibleTooltip = () => screen.getByRole("tooltip").parentElement as HTMLElement;

const renderTooltip = async (
    rootProps: Partial<React.ComponentProps<typeof Tooltip>> = {},
    providerProps: Partial<React.ComponentProps<typeof TooltipProvider>> = {},
) => {
    const view = render(
        <TooltipProvider delayDuration={0} {...providerProps}>
            <Tooltip {...rootProps}>
                <TooltipTrigger>Save</TooltipTrigger>
                <TooltipContent>Save the draft</TooltipContent>
            </Tooltip>
        </TooltipProvider>,
    );
    if (rootProps.open || rootProps.defaultOpen) {
        await settleFloatingUi();
    }
    return view;
};

describe("Tooltip", () => {
    test("keeps the tooltip out of the document until the trigger is hovered", () => {
        renderTooltip();

        expect(screen.queryByRole("tooltip")).toBeNull();
        expect(screen.queryByText("Save the draft")).toBeNull();
    });

    test("leaves the trigger undescribed while closed", () => {
        renderTooltip();

        const trigger = screen.getByRole("button", { name: "Save" });
        expect(trigger).toHaveAttribute("data-state", "closed");
        expect(trigger).not.toHaveAttribute("aria-describedby");
    });

    test("throws when used outside a TooltipProvider", () => {
        expect(() =>
            render(
                <Tooltip open>
                    <TooltipTrigger>Save</TooltipTrigger>
                    <TooltipContent>Save the draft</TooltipContent>
                </Tooltip>,
            ),
        ).toThrow(/must be used within `TooltipProvider`/);
    });

    test("opens when the trigger is hovered", async () => {
        renderTooltip();

        await userEvent.hover(screen.getByRole("button", { name: "Save" }));

        await waitForUi(() => expect(getHiddenTooltip()).toBeInTheDocument());
        expect(getVisibleTooltip()).toHaveTextContent("Save the draft");
    });

    test("marks a hover opened tooltip as delayed-open", async () => {
        renderTooltip();
        const trigger = screen.getByRole("button", { name: "Save" });

        await userEvent.hover(trigger);

        await waitForUi(() => expect(trigger).toHaveAttribute("data-state", "delayed-open"));
        expect(getVisibleTooltip()).toHaveAttribute("data-state", "delayed-open");
    });

    test("opens immediately when the trigger receives keyboard focus", async () => {
        renderTooltip();

        await userEvent.tab();

        await waitForUi(() => expect(getHiddenTooltip()).toBeInTheDocument());
        expect(screen.getByRole("button", { name: "Save" })).toHaveFocus();
        expect(getVisibleTooltip()).toHaveAttribute("data-state", "instant-open");
    });

    test("describes the trigger with the tooltip while it is open", async () => {
        renderTooltip();
        const trigger = screen.getByRole("button", { name: "Save" });

        await userEvent.hover(trigger);

        await waitForUi(() => expect(trigger).toHaveAttribute("aria-describedby", getHiddenTooltip().id));
        expect(trigger).toHaveAccessibleDescription("Save the draft");
    });

    test("closes when Escape is pressed", async () => {
        renderTooltip();

        await userEvent.hover(screen.getByRole("button", { name: "Save" }));
        await waitForUi(() => expect(getHiddenTooltip()).toBeInTheDocument());
        await userEvent.keyboard("{Escape}");

        await waitForUi(() => expect(screen.queryByRole("tooltip")).toBeNull());
    });

    test("closes when the trigger is clicked", async () => {
        renderTooltip();
        const trigger = screen.getByRole("button", { name: "Save" });

        await userEvent.hover(trigger);
        await waitForUi(() => expect(getHiddenTooltip()).toBeInTheDocument());
        await userEvent.click(trigger);

        await waitForUi(() => expect(screen.queryByRole("tooltip")).toBeNull());
    });

    // With hoverable content enabled (the default) leaving the trigger hands over to a grace area
    // that keeps the tooltip alive, so only `disableHoverableContent` closes on pointer leave.
    test("closes on pointer leave when hoverable content is disabled", async () => {
        renderTooltip({}, { disableHoverableContent: true });
        const trigger = screen.getByRole("button", { name: "Save" });

        await userEvent.hover(trigger);
        await waitForUi(() => expect(getHiddenTooltip()).toBeInTheDocument());
        await userEvent.unhover(trigger);

        await waitForUi(() => expect(screen.queryByRole("tooltip")).toBeNull());
    });

    // This pins the default (hoverable content on) rather than real dismissal timing: the grace
    // area is a pointer polygon built from bounding boxes, and happy-dom reports them all as zero
    // sized, so the hand off to the content never resolves here the way it would in a browser.
    test("stays open on pointer leave while hoverable content is enabled", async () => {
        renderTooltip();
        const trigger = screen.getByRole("button", { name: "Save" });

        await userEvent.hover(trigger);
        await waitForUi(() => expect(getHiddenTooltip()).toBeInTheDocument());
        await userEvent.unhover(trigger);

        expect(getHiddenTooltip()).toBeInTheDocument();
    });

    test("reports both open and close through onOpenChange", async () => {
        const changes: boolean[] = [];
        renderTooltip({ onOpenChange: (open) => changes.push(open) });

        await userEvent.hover(screen.getByRole("button", { name: "Save" }));
        await waitForUi(() => expect(getHiddenTooltip()).toBeInTheDocument());
        await userEvent.keyboard("{Escape}");

        await waitForUi(() => expect(changes).toEqual([true, false]));
    });

    test("starts open when defaultOpen is set", async () => {
        await renderTooltip({ defaultOpen: true });

        expect(getHiddenTooltip()).toBeInTheDocument();
        expect(getVisibleTooltip()).toHaveAttribute("data-state", "instant-open");
    });

    test("stays open while controlled even after Escape is pressed", async () => {
        const changes: boolean[] = [];
        await renderTooltip({ open: true, onOpenChange: (open) => changes.push(open) });

        await userEvent.keyboard("{Escape}");

        expect(changes).toEqual([false]);
        expect(getHiddenTooltip()).toBeInTheDocument();
    });

    test("stays closed while the open prop is controlled to false", async () => {
        const changes: boolean[] = [];
        renderTooltip({ open: false, onOpenChange: (open) => changes.push(open) });

        await userEvent.hover(screen.getByRole("button", { name: "Save" }));

        await waitForUi(() => expect(changes).toEqual([true]));
        expect(screen.queryByRole("tooltip")).toBeNull();
    });

    // This wrapper omits `TooltipPrimitive.Portal`, so the content stays inside the trigger's
    // subtree instead of being appended to the body like the other overlays in this folder.
    test("renders the content inline rather than in a portal", async () => {
        const { container } = await renderTooltip({ defaultOpen: true });

        expect(container).toContainElement(getVisibleTooltip());
    });

    test("duplicates the label so screen readers get a plain text copy", async () => {
        await renderTooltip({ defaultOpen: true });

        expect(screen.getAllByText("Save the draft")).toHaveLength(2);
        expect(getHiddenTooltip()).toHaveTextContent("Save the draft");
    });

    test("defaults the content to the top side", async () => {
        await renderTooltip({ defaultOpen: true });

        expect(getVisibleTooltip()).toHaveAttribute("data-side", "top");
        expect(getVisibleTooltip()).toHaveAttribute("data-align", "center");
    });

    test("forwards a non default side to the content", async () => {
        render(
            <TooltipProvider delayDuration={0}>
                <Tooltip defaultOpen>
                    <TooltipTrigger>Save</TooltipTrigger>
                    <TooltipContent side="right">Save the draft</TooltipContent>
                </Tooltip>
            </TooltipProvider>,
        );
        await settleFloatingUi();

        expect(getVisibleTooltip()).toHaveAttribute("data-side", "right");
    });

    test("merges custom classes into the content", async () => {
        render(
            <TooltipProvider delayDuration={0}>
                <Tooltip defaultOpen>
                    <TooltipTrigger>Save</TooltipTrigger>
                    <TooltipContent className="content-class">Save the draft</TooltipContent>
                </Tooltip>
            </TooltipProvider>,
        );
        await settleFloatingUi();

        expect(getVisibleTooltip()).toHaveClass("content-class", "rounded-md", "border");
    });

    test("renders the child element instead of a button when the trigger uses asChild", async () => {
        render(
            <TooltipProvider delayDuration={0}>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <a href="/save">Save</a>
                    </TooltipTrigger>
                    <TooltipContent>Save the draft</TooltipContent>
                </Tooltip>
            </TooltipProvider>,
        );

        const link = screen.getByRole("link", { name: "Save" });
        expect(link.tagName).toBe("A");

        await userEvent.hover(link);

        await waitForUi(() => expect(link).toHaveAttribute("aria-describedby", getHiddenTooltip().id));
    });

    test("prefers an explicit aria-label over the rendered content for the hidden copy", async () => {
        render(
            <TooltipProvider delayDuration={0}>
                <Tooltip defaultOpen>
                    <TooltipTrigger>Save</TooltipTrigger>
                    <TooltipContent aria-label="Save the draft to your device">
                        <span>Save the draft</span>
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>,
        );
        await settleFloatingUi();

        expect(getHiddenTooltip()).toHaveTextContent("Save the draft to your device");
        expect(screen.getByRole("button", { name: "Save" })).toHaveAccessibleDescription(
            "Save the draft to your device",
        );
    });

    test("forwards a ref to the content element", async () => {
        let captured: HTMLElement | null = null;
        render(
            <TooltipProvider delayDuration={0}>
                <Tooltip defaultOpen>
                    <TooltipTrigger>Save</TooltipTrigger>
                    <TooltipContent
                        ref={(node) => {
                            captured = node;
                        }}
                    >
                        Save the draft
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>,
        );
        await settleFloatingUi();

        expect(captured).toBe(getVisibleTooltip() as never);
    });
});
