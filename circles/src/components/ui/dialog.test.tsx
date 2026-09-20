import { describe, expect, test } from "bun:test";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogOverlay,
    DialogPortal,
    DialogTitle,
    DialogTrigger,
} from "./dialog";

const renderDialog = (props: Partial<React.ComponentProps<typeof Dialog>> = {}) =>
    render(
        <Dialog {...props}>
            <DialogTrigger>Open settings</DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Settings</DialogTitle>
                    <DialogDescription>Change how the workspace behaves</DialogDescription>
                </DialogHeader>
                <button type="button">Rename workspace</button>
                <DialogFooter>
                    <DialogClose>Cancel</DialogClose>
                </DialogFooter>
            </DialogContent>
        </Dialog>,
    );

describe("Dialog", () => {
    test("keeps the content out of the document until the trigger is clicked", () => {
        renderDialog();

        expect(screen.queryByRole("dialog")).toBeNull();
        expect(screen.queryByText("Change how the workspace behaves")).toBeNull();
    });

    test("describes the trigger as a dialog opener", () => {
        renderDialog();

        const trigger = screen.getByRole("button", { name: "Open settings" });
        expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
        expect(trigger).toHaveAttribute("aria-expanded", "false");
        expect(trigger).toHaveAttribute("data-state", "closed");
    });

    test("opens the dialog when the trigger is clicked", async () => {
        renderDialog();
        // The trigger has to be captured up front: once the dialog opens Radix hides the rest of
        // the page with `aria-hidden`, which takes the trigger out of reach of role queries.
        const trigger = screen.getByRole("button", { name: "Open settings" });

        await userEvent.click(trigger);

        const dialog = await screen.findByRole("dialog");
        expect(dialog).toHaveAttribute("data-state", "open");
        expect(trigger).toHaveAttribute("aria-expanded", "true");
        expect(trigger).toHaveAttribute("data-state", "open");
    });

    // Radix marks the rest of the page `aria-hidden` instead of putting `aria-modal` on the content,
    // so the modal contract has to be asserted through the surrounding document.
    test("expresses modality by hiding the rest of the page rather than with aria-modal", async () => {
        render(
            <div>
                <button type="button">Behind the dialog</button>
                <Dialog defaultOpen>
                    <DialogContent>
                        <DialogTitle>Settings</DialogTitle>
                        <DialogDescription>Change how the workspace behaves</DialogDescription>
                    </DialogContent>
                </Dialog>
            </div>,
        );

        const dialog = await screen.findByRole("dialog");
        expect(dialog).not.toHaveAttribute("aria-modal");
        expect(screen.getByText("Behind the dialog").closest("[aria-hidden]")).toHaveAttribute("aria-hidden", "true");
        expect(document.body.style.pointerEvents).toBe("none");
    });

    test("renders the content in a portal outside the rendered tree", async () => {
        const { container } = renderDialog();

        await userEvent.click(screen.getByRole("button", { name: "Open settings" }));

        const dialog = await screen.findByRole("dialog");
        expect(container).not.toContainElement(dialog);
        expect(document.body).toContainElement(dialog);
    });

    test("points the trigger at the content it controls", async () => {
        renderDialog();
        const trigger = screen.getByRole("button", { name: "Open settings" });

        await userEvent.click(trigger);

        const dialog = await screen.findByRole("dialog");
        expect(trigger.getAttribute("aria-controls")).toBe(dialog.id);
    });

    test("labels and describes the dialog with its title and description", async () => {
        renderDialog();

        await userEvent.click(screen.getByRole("button", { name: "Open settings" }));

        const dialog = await screen.findByRole("dialog");
        const title = screen.getByText("Settings");
        const description = screen.getByText("Change how the workspace behaves");
        expect(dialog).toHaveAttribute("aria-labelledby", title.id);
        expect(dialog).toHaveAttribute("aria-describedby", description.id);
        expect(dialog).toHaveAccessibleName("Settings");
    });

    // Radix always emits `aria-describedby`, so a dialog without a `DialogDescription` ends up
    // pointing at an element that is never rendered. It logs a warning but ships the broken id.
    test("still points aria-describedby at a missing element when no description is rendered", async () => {
        render(
            <Dialog defaultOpen>
                <DialogContent>
                    <DialogTitle>Settings</DialogTitle>
                </DialogContent>
            </Dialog>,
        );

        const dialog = await screen.findByRole("dialog");
        const describedBy = dialog.getAttribute("aria-describedby");
        expect(describedBy).not.toBeNull();
        expect(document.getElementById(describedBy as string)).toBeNull();
    });

    test("closes when Escape is pressed", async () => {
        renderDialog();

        await userEvent.click(screen.getByRole("button", { name: "Open settings" }));
        await screen.findByRole("dialog");
        await userEvent.keyboard("{Escape}");

        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    });

    test("closes when the built in close button is clicked", async () => {
        renderDialog();

        await userEvent.click(screen.getByRole("button", { name: "Open settings" }));
        await screen.findByRole("dialog");
        await userEvent.click(screen.getByRole("button", { name: "Close" }));

        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    });

    test("closes when a DialogClose child is clicked", async () => {
        renderDialog();

        await userEvent.click(screen.getByRole("button", { name: "Open settings" }));
        await screen.findByRole("dialog");
        await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    });

    test("closes when the overlay behind the dialog is clicked", async () => {
        renderDialog();

        await userEvent.click(screen.getByRole("button", { name: "Open settings" }));
        const dialog = await screen.findByRole("dialog");
        const overlay = dialog.parentElement?.querySelector(".bg-black\\/80");
        expect(overlay).not.toBeNull();

        await userEvent.click(overlay as HTMLElement, { pointerEventsCheck: 0 });

        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    });

    test("reports both open and close through onOpenChange", async () => {
        const changes: boolean[] = [];
        renderDialog({ onOpenChange: (open) => changes.push(open) });

        await userEvent.click(screen.getByRole("button", { name: "Open settings" }));
        await screen.findByRole("dialog");
        await userEvent.keyboard("{Escape}");

        await waitFor(() => expect(changes).toEqual([true, false]));
    });

    test("starts open when defaultOpen is set", async () => {
        renderDialog({ defaultOpen: true });

        expect(await screen.findByRole("dialog")).toBeInTheDocument();
    });

    test("stays open while controlled even after Escape is pressed", async () => {
        const changes: boolean[] = [];
        renderDialog({ open: true, onOpenChange: (open) => changes.push(open) });

        await screen.findByRole("dialog");
        await userEvent.keyboard("{Escape}");

        expect(changes).toEqual([false]);
        expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    test("ignores trigger clicks while the open prop is controlled to false", async () => {
        const changes: boolean[] = [];
        renderDialog({ open: false, onOpenChange: (open) => changes.push(open) });

        await userEvent.click(screen.getByRole("button", { name: "Open settings" }));

        expect(changes).toEqual([true]);
        expect(screen.queryByRole("dialog")).toBeNull();
    });

    test("moves focus into the dialog when it opens", async () => {
        renderDialog();

        await userEvent.click(screen.getByRole("button", { name: "Open settings" }));

        const dialog = await screen.findByRole("dialog");
        await waitFor(() => expect(dialog).toContainElement(document.activeElement as HTMLElement));
    });

    test("returns focus to the trigger when the dialog closes", async () => {
        renderDialog();
        const trigger = screen.getByRole("button", { name: "Open settings" });

        await userEvent.click(trigger);
        await screen.findByRole("dialog");
        await userEvent.keyboard("{Escape}");

        await waitFor(() => expect(trigger).toHaveFocus());
    });

    test("renders the child element instead of a button when the trigger uses asChild", () => {
        render(
            <Dialog>
                <DialogTrigger asChild>
                    <a href="/settings">Open settings</a>
                </DialogTrigger>
                <DialogContent>
                    <DialogTitle>Settings</DialogTitle>
                </DialogContent>
            </Dialog>,
        );

        const link = screen.getByRole("link", { name: "Open settings" });
        expect(link.tagName).toBe("A");
        expect(link).toHaveAttribute("aria-haspopup", "dialog");
    });

    test("closes through an asChild close element", async () => {
        render(
            <Dialog defaultOpen>
                <DialogContent>
                    <DialogTitle>Settings</DialogTitle>
                    <DialogClose asChild>
                        <a href="#dismiss">Dismiss</a>
                    </DialogClose>
                </DialogContent>
            </Dialog>,
        );

        await screen.findByRole("dialog");
        await userEvent.click(screen.getByRole("link", { name: "Dismiss" }));

        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    });

    test("merges custom classes into content, title and description", async () => {
        render(
            <Dialog defaultOpen>
                <DialogContent className="content-class">
                    <DialogTitle className="title-class">Settings</DialogTitle>
                    <DialogDescription className="description-class">Details</DialogDescription>
                </DialogContent>
            </Dialog>,
        );

        const dialog = await screen.findByRole("dialog");
        expect(dialog).toHaveClass("content-class", "fixed");
        expect(screen.getByText("Settings")).toHaveClass("title-class", "font-semibold");
        expect(screen.getByText("Details")).toHaveClass("description-class", "text-muted-foreground");
    });

    test("merges custom classes into header and footer wrappers", () => {
        render(
            <>
                <DialogHeader className="header-class" data-testid="header">
                    Header
                </DialogHeader>
                <DialogFooter className="footer-class" data-testid="footer">
                    Footer
                </DialogFooter>
            </>,
        );

        expect(screen.getByTestId("header")).toHaveClass("header-class", "flex", "flex-col");
        expect(screen.getByTestId("footer")).toHaveClass("footer-class", "flex-col-reverse");
    });

    test("merges custom classes into a standalone overlay", async () => {
        render(
            <Dialog defaultOpen>
                <DialogPortal>
                    <DialogOverlay className="overlay-class" data-testid="overlay" />
                </DialogPortal>
            </Dialog>,
        );

        const overlay = await screen.findByTestId("overlay");
        expect(overlay).toHaveClass("overlay-class", "fixed", "inset-0");
    });

    test("renders the title as a heading element", async () => {
        renderDialog({ defaultOpen: true });

        expect(await screen.findByRole("heading", { name: "Settings" })).toBeInTheDocument();
    });

    test("keeps content mounted across open and close cycles only while open", async () => {
        renderDialog();
        const trigger = screen.getByRole("button", { name: "Open settings" });

        await userEvent.click(trigger);
        await screen.findByRole("dialog");
        await userEvent.keyboard("{Escape}");
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
        await userEvent.click(trigger);

        expect(await screen.findByRole("dialog")).toBeInTheDocument();
    });
});
