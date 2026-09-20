import { describe, expect, test } from "bun:test";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogOverlay,
    AlertDialogPortal,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "./alert-dialog";

const renderAlertDialog = (props: Partial<React.ComponentProps<typeof AlertDialog>> = {}) =>
    render(
        <AlertDialog {...props}>
            <AlertDialogTrigger>Delete circle</AlertDialogTrigger>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Delete this circle?</AlertDialogTitle>
                    <AlertDialogDescription>This removes every post and member.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction>Delete</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>,
    );

describe("AlertDialog", () => {
    test("keeps the content out of the document until the trigger is clicked", () => {
        renderAlertDialog();

        expect(screen.queryByRole("alertdialog")).toBeNull();
        expect(screen.queryByText("This removes every post and member.")).toBeNull();
    });

    test("describes the trigger as a dialog opener", () => {
        renderAlertDialog();

        const trigger = screen.getByRole("button", { name: "Delete circle" });
        expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
        expect(trigger).toHaveAttribute("aria-expanded", "false");
        expect(trigger).toHaveAttribute("data-state", "closed");
    });

    test("opens with the alertdialog role when the trigger is clicked", async () => {
        renderAlertDialog();
        // Captured before opening: Radix hides the rest of the page with `aria-hidden`, which
        // removes the trigger from role based queries while the dialog is open.
        const trigger = screen.getByRole("button", { name: "Delete circle" });

        await userEvent.click(trigger);

        const dialog = await screen.findByRole("alertdialog");
        expect(dialog).toHaveAttribute("data-state", "open");
        expect(trigger).toHaveAttribute("aria-expanded", "true");
    });

    test("renders the content in a portal outside the rendered tree", async () => {
        const { container } = renderAlertDialog({ defaultOpen: true });

        const dialog = await screen.findByRole("alertdialog");
        expect(container).not.toContainElement(dialog);
        expect(document.body).toContainElement(dialog);
    });

    test("labels and describes the dialog with its title and description", async () => {
        renderAlertDialog({ defaultOpen: true });

        const dialog = await screen.findByRole("alertdialog");
        expect(dialog).toHaveAttribute("aria-labelledby", screen.getByText("Delete this circle?").id);
        expect(dialog).toHaveAttribute("aria-describedby", screen.getByText("This removes every post and member.").id);
        expect(dialog).toHaveAccessibleName("Delete this circle?");
        expect(dialog).toHaveAccessibleDescription("This removes every post and member.");
    });

    test("focuses the cancel button when it opens", async () => {
        renderAlertDialog({ defaultOpen: true });

        await screen.findByRole("alertdialog");

        await waitFor(() => expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus());
    });

    test("closes when Escape is pressed", async () => {
        renderAlertDialog({ defaultOpen: true });

        await screen.findByRole("alertdialog");
        await userEvent.keyboard("{Escape}");

        await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    });

    test("stays open when the overlay behind it is clicked", async () => {
        renderAlertDialog({ defaultOpen: true });

        const dialog = await screen.findByRole("alertdialog");
        const overlay = dialog.parentElement?.querySelector(".bg-black\\/80");
        expect(overlay).not.toBeNull();

        await userEvent.click(overlay as HTMLElement, { pointerEventsCheck: 0 });

        expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    });

    test("closes when the cancel button is clicked", async () => {
        renderAlertDialog({ defaultOpen: true });

        await screen.findByRole("alertdialog");
        await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

        await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    });

    test("closes when the action button is clicked", async () => {
        renderAlertDialog({ defaultOpen: true });

        await screen.findByRole("alertdialog");
        await userEvent.click(screen.getByRole("button", { name: "Delete" }));

        await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    });

    test("runs the action handler before closing", async () => {
        let confirmed = 0;
        render(
            <AlertDialog defaultOpen>
                <AlertDialogContent>
                    <AlertDialogTitle>Delete this circle?</AlertDialogTitle>
                    <AlertDialogDescription>Permanent</AlertDialogDescription>
                    <AlertDialogAction onClick={() => (confirmed += 1)}>Delete</AlertDialogAction>
                </AlertDialogContent>
            </AlertDialog>,
        );

        await screen.findByRole("alertdialog");
        await userEvent.click(screen.getByRole("button", { name: "Delete" }));

        expect(confirmed).toBe(1);
        await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    });

    test("reports both open and close through onOpenChange", async () => {
        const changes: boolean[] = [];
        renderAlertDialog({ onOpenChange: (open) => changes.push(open) });

        await userEvent.click(screen.getByRole("button", { name: "Delete circle" }));
        await screen.findByRole("alertdialog");
        await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

        await waitFor(() => expect(changes).toEqual([true, false]));
    });

    test("starts open when defaultOpen is set", async () => {
        renderAlertDialog({ defaultOpen: true });

        expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
    });

    test("stays open while controlled even after cancel is clicked", async () => {
        const changes: boolean[] = [];
        renderAlertDialog({ open: true, onOpenChange: (open) => changes.push(open) });

        await screen.findByRole("alertdialog");
        await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

        expect(changes).toEqual([false]);
        expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    });

    test("returns focus to the trigger when the dialog closes", async () => {
        renderAlertDialog();
        const trigger = screen.getByRole("button", { name: "Delete circle" });

        await userEvent.click(trigger);
        await screen.findByRole("alertdialog");
        await userEvent.keyboard("{Escape}");

        await waitFor(() => expect(trigger).toHaveFocus());
    });

    test("hides the rest of the page while it is open", async () => {
        render(
            <div>
                <button type="button">Behind the dialog</button>
                <AlertDialog defaultOpen>
                    <AlertDialogContent>
                        <AlertDialogTitle>Delete this circle?</AlertDialogTitle>
                        <AlertDialogDescription>Permanent</AlertDialogDescription>
                    </AlertDialogContent>
                </AlertDialog>
            </div>,
        );

        await screen.findByRole("alertdialog");

        expect(screen.getByText("Behind the dialog").closest("[aria-hidden]")).toHaveAttribute("aria-hidden", "true");
        expect(document.body.style.pointerEvents).toBe("none");
    });

    test("renders the child element instead of a button when the trigger uses asChild", () => {
        render(
            <AlertDialog>
                <AlertDialogTrigger asChild>
                    <a href="/delete">Delete circle</a>
                </AlertDialogTrigger>
                <AlertDialogContent>
                    <AlertDialogTitle>Delete this circle?</AlertDialogTitle>
                    <AlertDialogDescription>Permanent</AlertDialogDescription>
                </AlertDialogContent>
            </AlertDialog>,
        );

        const link = screen.getByRole("link", { name: "Delete circle" });
        expect(link.tagName).toBe("A");
        expect(link).toHaveAttribute("aria-haspopup", "dialog");
    });

    test("styles the action with the default button variant and the cancel with the outline variant", async () => {
        renderAlertDialog({ defaultOpen: true });

        await screen.findByRole("alertdialog");

        expect(screen.getByRole("button", { name: "Delete" })).toHaveClass("inline-flex", "h-10");
        expect(screen.getByRole("button", { name: "Cancel" })).toHaveClass("inline-flex", "border", "mt-2");
    });

    test("merges custom classes into content, title, description, action and cancel", async () => {
        render(
            <AlertDialog defaultOpen>
                <AlertDialogContent className="content-class">
                    <AlertDialogTitle className="title-class">Delete this circle?</AlertDialogTitle>
                    <AlertDialogDescription className="description-class">Permanent</AlertDialogDescription>
                    <AlertDialogCancel className="cancel-class">Cancel</AlertDialogCancel>
                    <AlertDialogAction className="action-class">Delete</AlertDialogAction>
                </AlertDialogContent>
            </AlertDialog>,
        );

        const dialog = await screen.findByRole("alertdialog");
        expect(dialog).toHaveClass("content-class", "fixed");
        expect(screen.getByText("Delete this circle?")).toHaveClass("title-class", "font-semibold");
        expect(screen.getByText("Permanent")).toHaveClass("description-class", "text-muted-foreground");
        expect(screen.getByRole("button", { name: "Cancel" })).toHaveClass("cancel-class");
        expect(screen.getByRole("button", { name: "Delete" })).toHaveClass("action-class");
    });

    test("merges custom classes into header and footer wrappers", () => {
        render(
            <>
                <AlertDialogHeader className="header-class" data-testid="header">
                    Header
                </AlertDialogHeader>
                <AlertDialogFooter className="footer-class" data-testid="footer">
                    Footer
                </AlertDialogFooter>
            </>,
        );

        expect(screen.getByTestId("header")).toHaveClass("header-class", "flex", "flex-col");
        expect(screen.getByTestId("footer")).toHaveClass("footer-class", "flex-col-reverse");
    });

    test("merges custom classes into a standalone overlay", async () => {
        render(
            <AlertDialog defaultOpen>
                <AlertDialogPortal>
                    <AlertDialogOverlay className="overlay-class" data-testid="overlay" />
                </AlertDialogPortal>
            </AlertDialog>,
        );

        const overlay = await screen.findByTestId("overlay");
        expect(overlay).toHaveClass("overlay-class", "fixed", "inset-0");
    });

    test("renders the title as a heading element", async () => {
        renderAlertDialog({ defaultOpen: true });

        expect(await screen.findByRole("heading", { name: "Delete this circle?" })).toBeInTheDocument();
    });
});
