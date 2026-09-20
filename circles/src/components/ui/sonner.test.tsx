import { describe, expect, test } from "bun:test";
import { act, render, screen, waitFor } from "@testing-library/react";
import { ThemeProvider } from "next-themes";
import { toast as sonnerToast } from "sonner";
import { Toaster } from "./sonner";

// sonner only renders its toast list once something is published to its module-level store, so the
// theme/class wiring is only observable after a toast exists. A freshly mounted <Toaster /> starts
// with an empty list (sonner does not replay past toasts to new subscribers), so each test below
// publishes its own uniquely worded toast rather than resetting shared state.
const toastList = () => document.querySelector("[data-sonner-toaster]");

const publish = (message: string, data?: Parameters<typeof sonnerToast>[1]) => {
    act(() => {
        sonnerToast(message, data);
    });
};

const withTheme = (theme: string, children: React.ReactNode) => (
    <ThemeProvider attribute="class" defaultTheme={theme} enableSystem={false} storageKey="sonner-test-theme">
        {children}
    </ThemeProvider>
);

describe("sonner Toaster", () => {
    test("renders the notification region before any toast is published", () => {
        render(<Toaster />);

        expect(screen.getByLabelText("Notifications alt+T")).toBeInTheDocument();
        expect(toastList()).toBeNull();
    });

    test("renders a toast published through the sonner store", async () => {
        render(<Toaster />);

        publish("Circle created");

        expect(await screen.findByText("Circle created")).toBeInTheDocument();
        expect(toastList()).toContainElement(screen.getByText("Circle created"));
    });

    test("gives the toast list the toaster marker classes", async () => {
        render(<Toaster />);

        publish("Classed toast");
        await screen.findByText("Classed toast");

        expect(toastList()).toHaveClass("toaster", "group");
    });

    test("applies the configured class names to the toast row", async () => {
        render(<Toaster />);

        publish("Styled toast");
        await screen.findByText("Styled toast");

        expect(document.querySelector("[data-sonner-toast]")).toHaveClass(
            "group",
            "toast",
            "group-[.toaster]:bg-background",
            "group-[.toaster]:text-foreground",
        );
    });

    test("applies the configured class name to the toast description", async () => {
        render(<Toaster />);

        publish("Described toast", { description: "Something happened" });
        await screen.findByText("Described toast");

        expect(screen.getByText("Something happened")).toHaveClass("group-[.toast]:text-muted-foreground");
    });

    test("applies the configured class name to the action button", async () => {
        let undos = 0;
        render(<Toaster />);

        publish("Actionable toast", { action: { label: "Undo", onClick: () => (undos += 1) } });
        const action = await screen.findByRole("button", { name: "Undo" });

        expect(action).toHaveClass("group-[.toast]:bg-primary", "group-[.toast]:text-primary-foreground");
        expect(undos).toBe(0);
    });

    test("resolves the theme to light when no theme provider supplies one", async () => {
        // useTheme() falls back to "system" and the test matchMedia stub never matches dark.
        render(<Toaster />);

        publish("System theme toast");
        await screen.findByText("System theme toast");

        expect(toastList()).toHaveAttribute("data-theme", "light");
    });

    test("uses the dark theme reported by next-themes", async () => {
        render(withTheme("dark", <Toaster />));

        publish("Dark theme toast");
        await screen.findByText("Dark theme toast");

        expect(toastList()).toHaveAttribute("data-theme", "dark");
    });

    test("lets an explicit theme prop win over the next-themes theme", async () => {
        render(withTheme("dark", <Toaster theme="light" />));

        publish("Overridden theme toast");
        await screen.findByText("Overridden theme toast");

        expect(toastList()).toHaveAttribute("data-theme", "light");
    });

    test("defaults the toast list to the bottom right corner", async () => {
        render(<Toaster />);

        publish("Default position toast");
        await screen.findByText("Default position toast");

        expect(toastList()).toHaveAttribute("data-y-position", "bottom");
        expect(toastList()).toHaveAttribute("data-x-position", "right");
    });

    test("forwards the position prop to sonner", async () => {
        render(<Toaster position="top-center" />);

        publish("Positioned toast");
        await screen.findByText("Positioned toast");

        expect(toastList()).toHaveAttribute("data-y-position", "top");
        expect(toastList()).toHaveAttribute("data-x-position", "center");
    });

    test("forwards the closeButton prop so toasts get a close control", async () => {
        render(<Toaster closeButton />);

        publish("Closable toast");
        await screen.findByText("Closable toast");

        expect(screen.getByLabelText("Close toast")).toBeInTheDocument();
    });

    test("renders no close control by default", async () => {
        render(<Toaster />);

        publish("Plain toast");
        await screen.findByText("Plain toast");

        expect(screen.queryByLabelText("Close toast")).toBeNull();
    });

    test("removes a toast from the list when it is dismissed", async () => {
        render(<Toaster />);
        const id = sonnerToast("Dismissable toast");
        await screen.findByText("Dismissable toast");

        act(() => {
            sonnerToast.dismiss(id);
        });

        await waitFor(() => expect(screen.queryByText("Dismissable toast")).toBeNull(), { timeout: 5000 });
    });

    test("removes the notification region from the document on unmount", async () => {
        const { unmount } = render(<Toaster />);
        publish("Unmounted toast");
        await screen.findByText("Unmounted toast");

        unmount();

        expect(screen.queryByLabelText("Notifications alt+T")).toBeNull();
        expect(toastList()).toBeNull();
    });
});
