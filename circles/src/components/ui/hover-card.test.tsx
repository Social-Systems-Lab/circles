import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { settleFloatingUi, waitForUi } from "@/test/react-act";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "./hover-card";

// The content carries no ARIA role, so it has to be reached through its text.
const getContent = () => screen.getByText("Circle of gardeners");
const queryContent = () => screen.queryByText("Circle of gardeners");

const renderHoverCard = async (props: Partial<React.ComponentProps<typeof HoverCard>> = {}) => {
    const view = render(
        <div>
            <button type="button">Outside the card</button>
            <HoverCard openDelay={0} closeDelay={0} {...props}>
                <HoverCardTrigger>Gardening</HoverCardTrigger>
                <HoverCardContent>Circle of gardeners</HoverCardContent>
            </HoverCard>
        </div>,
    );
    if (props.open || props.defaultOpen) {
        await settleFloatingUi();
    }
    return view;
};

describe("HoverCard", () => {
    test("keeps the content out of the document until the trigger is hovered", () => {
        renderHoverCard();

        expect(queryContent()).toBeNull();
    });

    // The trigger is `Primitive.a`, so without an href it renders an anchor with no link role
    // and no aria-expanded / aria-haspopup wiring at all.
    test("renders the trigger as a plain anchor with only a data-state hook", () => {
        renderHoverCard();

        const trigger = screen.getByText("Gardening");
        expect(trigger.tagName).toBe("A");
        expect(trigger).toHaveAttribute("data-state", "closed");
        expect(trigger).not.toHaveAttribute("aria-expanded");
        expect(trigger).not.toHaveAttribute("aria-haspopup");
        expect(screen.queryByRole("link")).toBeNull();
    });

    test("opens the content when the trigger is hovered", async () => {
        renderHoverCard();

        await userEvent.hover(screen.getByText("Gardening"));

        await waitForUi(() => expect(queryContent()).not.toBeNull());
        expect(getContent()).toHaveAttribute("data-state", "open");
        expect(screen.getByText("Gardening")).toHaveAttribute("data-state", "open");
    });

    test("closes again when the pointer leaves the trigger", async () => {
        renderHoverCard();
        const trigger = screen.getByText("Gardening");

        await userEvent.hover(trigger);
        await waitForUi(() => expect(queryContent()).not.toBeNull());
        await userEvent.unhover(trigger);

        await waitForUi(() => expect(queryContent()).toBeNull());
    });

    test("opens when the trigger receives keyboard focus", async () => {
        render(
            <HoverCard openDelay={0} closeDelay={0}>
                <HoverCardTrigger href="/circles/gardening">Gardening</HoverCardTrigger>
                <HoverCardContent>Circle of gardeners</HoverCardContent>
            </HoverCard>,
        );

        await userEvent.tab();

        expect(screen.getByRole("link", { name: "Gardening" })).toHaveFocus();
        await waitForUi(() => expect(queryContent()).not.toBeNull());
    });

    test("renders the content in a portal outside the rendered tree", async () => {
        const { container } = await renderHoverCard({ open: true });

        const content = getContent();
        expect(container).not.toContainElement(content);
        expect(document.body).toContainElement(content);
    });

    test("closes when Escape is pressed", async () => {
        renderHoverCard();

        await userEvent.hover(screen.getByText("Gardening"));
        await waitForUi(() => expect(queryContent()).not.toBeNull());
        await userEvent.keyboard("{Escape}");

        await waitForUi(() => expect(queryContent()).toBeNull());
    });

    test("reports both open and close through onOpenChange", async () => {
        const changes: boolean[] = [];
        renderHoverCard({ onOpenChange: (open) => changes.push(open) });

        await userEvent.hover(screen.getByText("Gardening"));
        await waitForUi(() => expect(queryContent()).not.toBeNull());
        await userEvent.keyboard("{Escape}");

        await waitForUi(() => expect(changes).toEqual([true, false]));
    });

    test("starts open when defaultOpen is set", async () => {
        await renderHoverCard({ defaultOpen: true });

        expect(getContent()).toBeInTheDocument();
    });

    test("stays open while controlled even after Escape is pressed", async () => {
        const changes: boolean[] = [];
        await renderHoverCard({ open: true, onOpenChange: (open) => changes.push(open) });

        await userEvent.keyboard("{Escape}");

        expect(changes).toEqual([false]);
        expect(getContent()).toBeInTheDocument();
    });

    test("stays closed while the open prop is controlled to false", async () => {
        const changes: boolean[] = [];
        renderHoverCard({ open: false, onOpenChange: (open) => changes.push(open) });

        await userEvent.hover(screen.getByText("Gardening"));

        await waitForUi(() => expect(changes).toEqual([true]));
        expect(queryContent()).toBeNull();
    });

    // A hover card is informational, so Radix deliberately leaves focus on the trigger and keeps
    // the rest of the page interactive.
    test("leaves focus outside the card and the page interactive while open", async () => {
        renderHoverCard();
        const trigger = screen.getByText("Gardening");

        await userEvent.hover(trigger);
        await waitForUi(() => expect(queryContent()).not.toBeNull());

        expect(getContent()).not.toContainElement(document.activeElement as HTMLElement);
        expect(screen.getByRole("button", { name: "Outside the card" })).toBeInTheDocument();
        expect(document.body.style.pointerEvents).not.toBe("none");
    });

    test("renders the child element instead of an anchor when the trigger uses asChild", async () => {
        render(
            <HoverCard openDelay={0} closeDelay={0}>
                <HoverCardTrigger asChild>
                    <button type="button">Gardening</button>
                </HoverCardTrigger>
                <HoverCardContent>Circle of gardeners</HoverCardContent>
            </HoverCard>,
        );

        const trigger = screen.getByRole("button", { name: "Gardening" });
        expect(trigger.tagName).toBe("BUTTON");

        await userEvent.hover(trigger);

        await waitForUi(() => expect(queryContent()).not.toBeNull());
    });

    test("merges custom classes into the content", async () => {
        render(
            <HoverCard open>
                <HoverCardTrigger>Gardening</HoverCardTrigger>
                <HoverCardContent className="content-class">Circle of gardeners</HoverCardContent>
            </HoverCard>,
        );
        await settleFloatingUi();

        expect(getContent()).toHaveClass("content-class", "w-64", "rounded-md");
    });

    test("defaults the content to centre alignment on the bottom side", async () => {
        await renderHoverCard({ open: true });

        expect(getContent()).toHaveAttribute("data-align", "center");
        expect(getContent()).toHaveAttribute("data-side", "bottom");
    });

    test("forwards a non default align to the content", async () => {
        render(
            <HoverCard open>
                <HoverCardTrigger>Gardening</HoverCardTrigger>
                <HoverCardContent align="end">Circle of gardeners</HoverCardContent>
            </HoverCard>,
        );
        await settleFloatingUi();

        expect(getContent()).toHaveAttribute("data-align", "end");
    });

    test("wraps the content in a positioned popper element", async () => {
        await renderHoverCard({ open: true });

        expect(getContent().parentElement).toHaveAttribute("data-radix-popper-content-wrapper");
    });

    test("forwards a ref to the content element", async () => {
        let captured: HTMLElement | null = null;
        render(
            <HoverCard open>
                <HoverCardTrigger>Gardening</HoverCardTrigger>
                <HoverCardContent
                    ref={(node) => {
                        captured = node;
                    }}
                >
                    Circle of gardeners
                </HoverCardContent>
            </HoverCard>,
        );
        await settleFloatingUi();

        expect(captured).toBe(getContent() as never);
    });
});
