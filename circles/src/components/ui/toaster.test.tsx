import { describe, expect, test } from "bun:test";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastAction } from "./toast";
import { Toaster } from "./toaster";
import { toast } from "./use-toast";

// `use-toast` keeps one module-level store shared by every test in this file, and TOAST_LIMIT is 1,
// so each new toast() call replaces whatever the previous test left behind. Tests therefore always
// push a fresh toast instead of assuming the store starts empty. The reducer/store itself is covered
// by use-toast.test.tsx; this file only covers what <Toaster /> renders.
const toastRow = () => document.querySelector("li");
const iconWithColor = (color: string) => document.querySelector(`li svg[color="${color}"]`);

const pushToast = (options: Parameters<typeof toast>[0]) => {
    let handle: ReturnType<typeof toast>;
    act(() => {
        handle = toast(options);
    });
    return handle!;
};

describe("Toaster", () => {
    test("renders the title and description of a toast created through the store", () => {
        render(<Toaster />);

        pushToast({ title: "Profile saved", description: "Your changes are live" });

        expect(screen.getByText("Profile saved")).toBeInTheDocument();
        expect(screen.getByText("Your changes are live")).toBeInTheDocument();
        expect(toastRow()).toContainElement(screen.getByText("Profile saved"));
    });

    test("renders a toast that only has a description", () => {
        render(<Toaster />);

        pushToast({ description: "Background sync finished" });

        expect(screen.getByText("Background sync finished")).toBeInTheDocument();
        expect(document.querySelectorAll("li .text-sm.font-semibold")).toHaveLength(0);
    });

    test("forwards the toast variant so the row gets its variant classes", () => {
        render(<Toaster />);

        pushToast({ title: "Could not save", variant: "destructive" });

        expect(toastRow()).toHaveClass("bg-destructive", "text-destructive-foreground");
    });

    test("renders the green check icon for the success icon", () => {
        render(<Toaster />);

        pushToast({ title: "Saved", icon: "success" });

        expect(iconWithColor("#47db71")).not.toBeNull();
        expect(iconWithColor("white")).toBeNull();
    });

    test("renders the white cross icon for the error icon", () => {
        render(<Toaster />);

        pushToast({ title: "Failed", icon: "error" });

        expect(iconWithColor("white")).not.toBeNull();
        expect(iconWithColor("#47db71")).toBeNull();
    });

    test("renders no icon when the icon is omitted", () => {
        render(<Toaster />);

        pushToast({ title: "Plain" });

        expect(document.querySelectorAll("li svg[color]")).toHaveLength(0);
    });

    test("renders no icon for the warning and info icons the store allows but the toaster does not map", () => {
        render(<Toaster />);

        pushToast({ title: "Careful", icon: "warning" });
        expect(document.querySelectorAll("li svg[color]")).toHaveLength(0);

        pushToast({ title: "Heads up", icon: "info" });
        expect(document.querySelectorAll("li svg[color]")).toHaveLength(0);
    });

    test("renders the action element handed to the store", async () => {
        let retries = 0;
        render(<Toaster />);

        pushToast({
            title: "Upload failed",
            action: (
                <ToastAction altText="Retry the upload" onClick={() => (retries += 1)}>
                    Retry
                </ToastAction>
            ) as never,
        });

        const action = screen.getByRole("button", { name: "Retry" });
        await userEvent.click(action);

        expect(retries).toBe(1);
    });

    test("always renders a close button for the toast", () => {
        render(<Toaster />);

        pushToast({ title: "Closable" });

        expect(document.querySelector("li [toast-close]")).not.toBeNull();
    });

    test("shows only the newest toast because the store keeps one at a time", () => {
        render(<Toaster />);

        pushToast({ title: "First" });
        pushToast({ title: "Second" });

        expect(document.querySelectorAll("li")).toHaveLength(1);
        expect(screen.getByText("Second")).toBeInTheDocument();
        expect(screen.queryByText("First")).toBeNull();
    });

    test("removes the toast from the viewport when its close button is clicked", async () => {
        render(<Toaster />);
        pushToast({ title: "Dismiss me" });

        await userEvent.click(document.querySelector("li [toast-close]") as HTMLElement);

        expect(toastRow()).toBeNull();
        expect(screen.queryByText("Dismiss me")).toBeNull();
    });

    test("removes the toast when it is dismissed through the store handle", () => {
        render(<Toaster />);
        const handle = pushToast({ title: "Dismiss me too" });

        act(() => {
            handle.dismiss();
        });

        expect(toastRow()).toBeNull();
        expect(screen.queryByText("Dismiss me too")).toBeNull();
    });

    test("re-renders the toast when the store handle updates it", () => {
        render(<Toaster />);
        const handle = pushToast({ title: "Uploading" });

        act(() => {
            handle.update({ id: handle.id, title: "Uploaded" } as Parameters<typeof handle.update>[0]);
        });

        expect(screen.getByText("Uploaded")).toBeInTheDocument();
        expect(screen.queryByText("Uploading")).toBeNull();
    });

    test("keeps the notification region mounted when there is no open toast", () => {
        render(<Toaster />);
        const handle = pushToast({ title: "Only toast" });

        act(() => {
            handle.dismiss();
        });

        expect(screen.getByRole("region")).toBeInTheDocument();
        expect(document.querySelector("ol")).toBeInTheDocument();
        expect(document.querySelectorAll("li")).toHaveLength(0);
    });

    test("picks up a toast created before the toaster mounted", () => {
        act(() => {
            toast({ title: "Queued early" });
        });

        render(<Toaster />);

        expect(screen.getByText("Queued early")).toBeInTheDocument();
    });

    test("stops rendering toasts once the toaster is unmounted", () => {
        const { unmount } = render(<Toaster />);
        pushToast({ title: "Before unmount" });

        unmount();

        expect(screen.queryByRole("region")).toBeNull();
        act(() => {
            toast({ title: "After unmount" });
        });
        expect(screen.queryByText("After unmount")).toBeNull();
    });
});
