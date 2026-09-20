import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "./card";

const renderCard = () =>
    render(
        <Card data-testid="card">
            <CardHeader data-testid="header">
                <CardTitle data-testid="title">Weekly gathering</CardTitle>
                <CardDescription data-testid="description">Every Tuesday at 18:00</CardDescription>
            </CardHeader>
            <CardContent data-testid="content">Bring something to share.</CardContent>
            <CardFooter data-testid="footer">
                <button type="button">Join</button>
            </CardFooter>
        </Card>,
    );

describe("Card", () => {
    test("renders the header, content and footer in the order they are composed", () => {
        renderCard();

        const card = screen.getByTestId("card");
        expect(Array.from(card.children)).toEqual([
            screen.getByTestId("header"),
            screen.getByTestId("content"),
            screen.getByTestId("footer"),
        ]);
    });

    test("nests the title and the description inside the header", () => {
        renderCard();

        const header = screen.getByTestId("header");
        expect(Array.from(header.children)).toEqual([screen.getByTestId("title"), screen.getByTestId("description")]);
    });

    test("passes the children of every section through", () => {
        renderCard();

        expect(screen.getByText("Weekly gathering")).toBeInTheDocument();
        expect(screen.getByText("Every Tuesday at 18:00")).toBeInTheDocument();
        expect(screen.getByText("Bring something to share.")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Join" })).toBeInTheDocument();
    });

    test("renders the card surface as a bordered div", () => {
        renderCard();

        const card = screen.getByTestId("card");
        expect(card.tagName).toBe("DIV");
        expect(card).toHaveClass("rounded-lg", "border", "bg-card", "text-card-foreground", "shadow-sm");
    });

    test("renders the title as a level three heading", () => {
        renderCard();

        const heading = screen.getByRole("heading", { level: 3, name: "Weekly gathering" });
        expect(heading.tagName).toBe("H3");
        expect(heading).toHaveClass("text-2xl", "font-semibold");
    });

    test("renders the description as a muted paragraph", () => {
        renderCard();

        const description = screen.getByTestId("description");
        expect(description.tagName).toBe("P");
        expect(description).toHaveClass("text-sm", "text-muted-foreground");
    });

    test("gives the header, content and footer their own padding classes", () => {
        renderCard();

        expect(screen.getByTestId("header")).toHaveClass("flex", "flex-col", "p-6");
        expect(screen.getByTestId("content")).toHaveClass("p-6", "pt-0");
        expect(screen.getByTestId("footer")).toHaveClass("flex", "items-center", "p-6", "pt-0");
    });

    test("renders arbitrary children without the dedicated sections", () => {
        render(
            <Card data-testid="card">
                <span>Bare content</span>
            </Card>,
        );

        expect(screen.getByTestId("card")).toContainElement(screen.getByText("Bare content"));
    });

    test("keeps the section structure when the sections have no children", () => {
        render(
            <Card data-testid="card">
                <CardHeader data-testid="header" />
                <CardContent data-testid="content" />
                <CardFooter data-testid="footer" />
            </Card>,
        );

        expect(screen.getByTestId("card").children).toHaveLength(3);
        expect(screen.getByTestId("header")).toBeEmptyDOMElement();
        expect(screen.getByTestId("content")).toBeEmptyDOMElement();
        expect(screen.getByTestId("footer")).toBeEmptyDOMElement();
    });

    test("merges custom classes on every part of the card", () => {
        render(
            <Card className="card-class" data-testid="card">
                <CardHeader className="header-class" data-testid="header">
                    <CardTitle className="title-class" data-testid="title">
                        Title
                    </CardTitle>
                    <CardDescription className="description-class" data-testid="description">
                        Description
                    </CardDescription>
                </CardHeader>
                <CardContent className="content-class" data-testid="content">
                    Content
                </CardContent>
                <CardFooter className="footer-class" data-testid="footer">
                    Footer
                </CardFooter>
            </Card>,
        );

        expect(screen.getByTestId("card")).toHaveClass("card-class", "rounded-lg");
        expect(screen.getByTestId("header")).toHaveClass("header-class", "flex");
        expect(screen.getByTestId("title")).toHaveClass("title-class", "font-semibold");
        expect(screen.getByTestId("description")).toHaveClass("description-class", "text-muted-foreground");
        expect(screen.getByTestId("content")).toHaveClass("content-class", "pt-0");
        expect(screen.getByTestId("footer")).toHaveClass("footer-class", "items-center");
    });

    test("lets a custom class win over a conflicting default class", () => {
        render(
            <Card className="rounded-none" data-testid="card">
                <CardTitle className="text-lg" data-testid="title">
                    Smaller title
                </CardTitle>
            </Card>,
        );

        const card = screen.getByTestId("card");
        const title = screen.getByTestId("title");
        expect(card).toHaveClass("rounded-none");
        expect(card).not.toHaveClass("rounded-lg");
        expect(title).toHaveClass("text-lg");
        expect(title).not.toHaveClass("text-2xl");
    });

    test("passes native attributes through on every part of the card", () => {
        render(
            <Card id="event-card" aria-labelledby="event-card-title" data-testid="card">
                <CardHeader lang="en" data-testid="header">
                    <CardTitle id="event-card-title" data-testid="title">
                        Title
                    </CardTitle>
                </CardHeader>
                <CardContent role="group" data-testid="content">
                    Content
                </CardContent>
                <CardFooter hidden data-testid="footer">
                    Footer
                </CardFooter>
            </Card>,
        );

        expect(screen.getByTestId("card")).toHaveAttribute("aria-labelledby", "event-card-title");
        expect(screen.getByTestId("card")).toHaveAttribute("id", "event-card");
        expect(screen.getByTestId("header")).toHaveAttribute("lang", "en");
        expect(screen.getByTestId("title")).toHaveAttribute("id", "event-card-title");
        expect(screen.getByTestId("content")).toHaveAttribute("role", "group");
        expect(screen.getByTestId("footer")).toHaveAttribute("hidden");
    });

    test("forwards refs on every part of the card", () => {
        const cardRef = { current: null as HTMLDivElement | null };
        const headerRef = { current: null as HTMLDivElement | null };
        const titleRef = { current: null as HTMLParagraphElement | null };
        const descriptionRef = { current: null as HTMLParagraphElement | null };
        const contentRef = { current: null as HTMLDivElement | null };
        const footerRef = { current: null as HTMLDivElement | null };
        render(
            <Card ref={cardRef} data-testid="card">
                <CardHeader ref={headerRef}>
                    <CardTitle ref={titleRef}>Title</CardTitle>
                    <CardDescription ref={descriptionRef}>Description</CardDescription>
                </CardHeader>
                <CardContent ref={contentRef}>Content</CardContent>
                <CardFooter ref={footerRef}>Footer</CardFooter>
            </Card>,
        );

        expect(cardRef.current).toBe(screen.getByTestId("card"));
        expect(headerRef.current?.tagName).toBe("DIV");
        expect(titleRef.current?.tagName).toBe("H3");
        expect(descriptionRef.current?.tagName).toBe("P");
        expect(contentRef.current).toHaveTextContent("Content");
        expect(footerRef.current).toHaveTextContent("Footer");
    });
});
