import { describe, expect, test } from "bun:test";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toast, ToastAction, ToastClose, ToastDescription, ToastProvider, ToastTitle, ToastViewport } from "./toast";

// Radix portals every open <Toast /> into the <ol> rendered by <ToastViewport />, so the
// toast row is always the single <li> in the document.
const toastRow = () => document.querySelector("li");

const renderToast = (
    toastProps: Partial<React.ComponentProps<typeof Toast>> = {},
    children: React.ReactNode = (
        <>
            <ToastTitle>Profile saved</ToastTitle>
            <ToastClose />
        </>
    ),
) =>
    render(
        <ToastProvider>
            <Toast {...toastProps}>{children}</Toast>
            <ToastViewport />
        </ToastProvider>,
    );

describe("Toast", () => {
    test("renders the title and description inside the viewport list", () => {
        renderToast(
            {},
            <>
                <ToastTitle>Profile saved</ToastTitle>
                <ToastDescription>Your changes are live</ToastDescription>
            </>,
        );

        expect(screen.getByText("Profile saved")).toBeInTheDocument();
        expect(screen.getByText("Your changes are live")).toBeInTheDocument();
        expect(toastRow()).toContainElement(screen.getByText("Profile saved"));
    });

    test("is open by default so the toast shows without an open prop", () => {
        renderToast();

        expect(toastRow()).toHaveAttribute("data-state", "open");
    });

    test("renders nothing when open is false", () => {
        renderToast({ open: false });

        expect(toastRow()).toBeNull();
        expect(screen.queryByText("Profile saved")).toBeNull();
    });

    test("renders nothing when the required viewport is missing", () => {
        render(
            <ToastProvider>
                <Toast open>
                    <ToastTitle>No viewport</ToastTitle>
                </Toast>
            </ToastProvider>,
        );

        expect(screen.queryByText("No viewport")).toBeNull();
    });

    test("throws when a toast is rendered outside a provider", () => {
        expect(() =>
            render(
                <Toast open>
                    <ToastTitle>Orphan</ToastTitle>
                </Toast>,
            ),
        ).toThrow("`Toast` must be used within `ToastProvider`");
    });

    test("announces itself as a live status region", () => {
        renderToast();

        expect(toastRow()).toHaveAttribute("role", "status");
        expect(toastRow()).toHaveAttribute("aria-atomic", "true");
    });

    test("applies the default variant classes", () => {
        renderToast();

        expect(toastRow()).toHaveClass("border", "bg-background", "text-foreground");
    });

    test("applies the success variant classes", () => {
        renderToast({ variant: "success" });

        expect(toastRow()).toHaveClass("bg-green-100");
        expect(toastRow()).not.toHaveClass("bg-background");
    });

    test("applies the destructive variant classes", () => {
        renderToast({ variant: "destructive" });

        expect(toastRow()).toHaveClass("destructive", "border-destructive", "bg-destructive", "text-destructive-foreground");
    });

    test("keeps the shared swipe and animation classes alongside a custom class", () => {
        renderToast({ className: "toast-marker" });

        expect(toastRow()).toHaveClass("toast-marker", "group", "pointer-events-auto", "overflow-hidden");
    });

    test("takes its swipe direction from the provider", () => {
        render(
            <ToastProvider swipeDirection="up">
                <Toast>
                    <ToastTitle>Swipe up</ToastTitle>
                </Toast>
                <ToastViewport />
            </ToastProvider>,
        );

        expect(toastRow()).toHaveAttribute("data-swipe-direction", "up");
    });

    test("defaults the swipe direction to right", () => {
        renderToast();

        expect(toastRow()).toHaveAttribute("data-swipe-direction", "right");
    });

    test("closes an uncontrolled toast when the close button is clicked", async () => {
        renderToast();

        await userEvent.click(screen.getByRole("button"));

        expect(toastRow()).toBeNull();
        expect(screen.queryByText("Profile saved")).toBeNull();
    });

    test("reports the close request through onOpenChange", async () => {
        const changes: boolean[] = [];
        renderToast({ onOpenChange: (open) => changes.push(open) });

        await userEvent.click(screen.getByRole("button"));

        expect(changes).toEqual([false]);
    });

    test("keeps a controlled toast open when the close button is clicked", async () => {
        const changes: boolean[] = [];
        renderToast({ open: true, onOpenChange: (open) => changes.push(open) });

        await userEvent.click(screen.getByRole("button"));

        expect(changes).toEqual([false]);
        expect(toastRow()).not.toBeNull();
    });

    test("closes itself once the duration elapses", async () => {
        renderToast({ duration: 20 });

        await waitFor(() => expect(toastRow()).toBeNull(), { timeout: 5000 });
    });

    test("exposes the toast-close hook and the close icon on the close button", () => {
        renderToast();

        const close = screen.getByRole("button");
        expect(close).toHaveAttribute("toast-close", "");
        expect(close).toHaveClass("absolute", "right-2", "top-2");
        expect(close.querySelector("svg")).not.toBeNull();
    });

    test("renders an action button with the alternative text recorded for screen readers", () => {
        renderToast(
            {},
            <>
                <ToastTitle>Upload failed</ToastTitle>
                <ToastAction altText="Retry the upload">Retry</ToastAction>
            </>,
        );

        const action = screen.getByRole("button", { name: "Retry" });
        expect(action).toHaveAttribute("data-radix-toast-announce-alt", "Retry the upload");
    });

    test("calls the action handler when the action is clicked", async () => {
        let retries = 0;
        renderToast(
            {},
            <>
                <ToastTitle>Upload failed</ToastTitle>
                <ToastAction altText="Retry" onClick={() => (retries += 1)}>
                    Retry
                </ToastAction>
            </>,
        );

        await userEvent.click(screen.getByRole("button", { name: "Retry" }));

        expect(retries).toBe(1);
    });

    test("does not call the action handler when the action is disabled", async () => {
        let retries = 0;
        renderToast(
            {},
            <>
                <ToastTitle>Upload failed</ToastTitle>
                <ToastAction altText="Retry" disabled onClick={() => (retries += 1)}>
                    Retry
                </ToastAction>
            </>,
        );

        const action = screen.getByRole("button", { name: "Retry" });
        expect(action).toBeDisabled();
        await userEvent.click(action, { pointerEventsCheck: 0 });

        expect(retries).toBe(0);
    });

    test("renders the viewport as an ordered list inside a labelled region", () => {
        renderToast();

        expect(screen.getByRole("region")).toHaveAttribute("aria-label", "Notifications (F8)");
        expect(document.querySelector("ol")).toHaveClass("fixed", "z-[100]", "flex");
    });

    test("uses the viewport label for the notification region", () => {
        render(
            <ToastProvider>
                <Toast>
                    <ToastTitle>Labelled</ToastTitle>
                </Toast>
                <ToastViewport label="Alerts" />
            </ToastProvider>,
        );

        expect(screen.getByRole("region")).toHaveAttribute("aria-label", "Alerts");
    });

    test("merges a custom class into the viewport", () => {
        render(
            <ToastProvider>
                <ToastViewport className="viewport-marker" />
            </ToastProvider>,
        );

        expect(document.querySelector("ol")).toHaveClass("viewport-marker", "fixed");
    });

    test("styles the title and description and lets custom classes through", () => {
        renderToast(
            {},
            <>
                <ToastTitle className="title-marker">Heading</ToastTitle>
                <ToastDescription className="description-marker">Body</ToastDescription>
            </>,
        );

        expect(screen.getByText("Heading")).toHaveClass("title-marker", "text-sm", "font-semibold");
        expect(screen.getByText("Body")).toHaveClass("description-marker", "text-sm", "opacity-90");
    });

    test("forwards refs to the underlying elements", () => {
        let toastNode: HTMLElement | null = null;
        let viewportNode: HTMLElement | null = null;
        render(
            <ToastProvider>
                <Toast ref={(node) => (toastNode = node)}>
                    <ToastTitle>With refs</ToastTitle>
                </Toast>
                <ToastViewport ref={(node) => (viewportNode = node)} />
            </ToastProvider>,
        );

        expect((toastNode as unknown as HTMLElement)?.tagName).toBe("LI");
        expect((viewportNode as unknown as HTMLElement)?.tagName).toBe("OL");
    });

    test("passes native attributes through to the toast row", () => {
        renderToast({ "data-testid": "toast-row", id: "saved-toast" } as React.ComponentProps<typeof Toast>);

        expect(screen.getByTestId("toast-row")).toHaveAttribute("id", "saved-toast");
    });

    test("removes the notification region from the document on unmount", () => {
        const { unmount } = renderToast();
        expect(screen.getByRole("region")).toBeInTheDocument();

        unmount();

        expect(screen.queryByRole("region")).toBeNull();
        expect(toastRow()).toBeNull();
    });
});
