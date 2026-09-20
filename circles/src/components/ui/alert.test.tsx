import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { Alert, AlertDescription, AlertTitle } from "./alert";

describe("Alert", () => {
    test("announces itself to assistive technology through the alert role", () => {
        render(<Alert>Storage is almost full</Alert>);

        const alert = screen.getByRole("alert");
        expect(alert.tagName).toBe("DIV");
        expect(alert).toHaveTextContent("Storage is almost full");
    });

    test("keeps the alert role even when it has no children", () => {
        render(<Alert />);

        const alert = screen.getByRole("alert");
        expect(alert).toBeEmptyDOMElement();
    });

    test("renders the title and the description inside the alert in the order they are composed", () => {
        render(
            <Alert>
                <AlertTitle>Heads up</AlertTitle>
                <AlertDescription>Your circle was archived.</AlertDescription>
            </Alert>,
        );

        const alert = screen.getByRole("alert");
        const title = screen.getByText("Heads up");
        const description = screen.getByText("Your circle was archived.");
        expect(alert).toContainElement(title);
        expect(alert).toContainElement(description);
        expect(Array.from(alert.children)).toEqual([title, description]);
    });

    test("renders the title as a level five heading", () => {
        render(
            <Alert>
                <AlertTitle>Heads up</AlertTitle>
            </Alert>,
        );

        const heading = screen.getByRole("heading", { level: 5 });
        expect(heading.tagName).toBe("H5");
        expect(heading).toHaveTextContent("Heads up");
    });

    test("renders the description as a div even though its props are typed for a paragraph", () => {
        render(
            <Alert>
                <AlertDescription>Details follow</AlertDescription>
            </Alert>,
        );

        expect(screen.getByText("Details follow").tagName).toBe("DIV");
    });

    test("uses the default variant colours when no variant is given", () => {
        render(<Alert>Default</Alert>);

        const alert = screen.getByRole("alert");
        expect(alert).toHaveClass("bg-background", "text-foreground", "rounded-lg", "border", "p-4");
    });

    test("uses the default variant colours when variant is explicitly undefined", () => {
        render(<Alert variant={undefined}>Undefined variant</Alert>);

        expect(screen.getByRole("alert")).toHaveClass("bg-background", "text-foreground");
    });

    test("applies the destructive variant colours instead of the default ones", () => {
        render(<Alert variant="destructive">Something broke</Alert>);

        const alert = screen.getByRole("alert");
        expect(alert).toHaveClass("text-destructive", "border-destructive/50");
        expect(alert).not.toHaveClass("bg-background", "text-foreground");
    });

    test("merges a custom class with the variant classes", () => {
        render(<Alert className="custom-class">Styled</Alert>);

        const alert = screen.getByRole("alert");
        expect(alert).toHaveClass("custom-class", "relative", "w-full");
    });

    test("lets a custom class win over a conflicting base class", () => {
        render(<Alert className="p-0">No padding</Alert>);

        const alert = screen.getByRole("alert");
        expect(alert).toHaveClass("p-0");
        expect(alert).not.toHaveClass("p-4");
    });

    test("merges custom classes on the title and the description", () => {
        render(
            <Alert>
                <AlertTitle className="title-class">Heads up</AlertTitle>
                <AlertDescription className="description-class">Details</AlertDescription>
            </Alert>,
        );

        expect(screen.getByText("Heads up")).toHaveClass("title-class", "font-medium");
        expect(screen.getByText("Details")).toHaveClass("description-class", "text-sm");
    });

    test("passes native attributes through to the rendered elements", () => {
        render(
            <Alert id="storage-alert" aria-live="assertive" data-testid="alert-root">
                <AlertTitle id="storage-alert-title">Heads up</AlertTitle>
                <AlertDescription lang="en">Details</AlertDescription>
            </Alert>,
        );

        const alert = screen.getByTestId("alert-root");
        expect(alert).toHaveAttribute("id", "storage-alert");
        expect(alert).toHaveAttribute("aria-live", "assertive");
        expect(screen.getByText("Heads up")).toHaveAttribute("id", "storage-alert-title");
        expect(screen.getByText("Details")).toHaveAttribute("lang", "en");
    });

    test("forwards a ref to the underlying alert container", () => {
        const ref = { current: null as HTMLDivElement | null };
        render(<Alert ref={ref}>With ref</Alert>);

        expect(ref.current).not.toBeNull();
        expect(ref.current).toBe(screen.getByRole("alert"));
    });

    test("forwards refs to the title and the description", () => {
        const titleRef = { current: null as HTMLParagraphElement | null };
        const descriptionRef = { current: null as HTMLParagraphElement | null };
        render(
            <Alert>
                <AlertTitle ref={titleRef}>Heads up</AlertTitle>
                <AlertDescription ref={descriptionRef}>Details</AlertDescription>
            </Alert>,
        );

        expect(titleRef.current?.tagName).toBe("H5");
        expect(descriptionRef.current?.tagName).toBe("DIV");
    });

    test("renders an icon child next to the text content", () => {
        render(
            <Alert>
                <svg data-testid="alert-icon" />
                <AlertTitle>Heads up</AlertTitle>
            </Alert>,
        );

        const alert = screen.getByRole("alert");
        expect(alert.firstElementChild).toBe(screen.getByTestId("alert-icon"));
        expect(alert).toContainElement(screen.getByText("Heads up"));
    });
});
