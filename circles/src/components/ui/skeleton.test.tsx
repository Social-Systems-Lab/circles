import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { Skeleton } from "./skeleton";

describe("Skeleton", () => {
    test("renders an empty pulsing placeholder div", () => {
        render(<Skeleton data-testid="skeleton" />);

        const skeleton = screen.getByTestId("skeleton");
        expect(skeleton.tagName).toBe("DIV");
        expect(skeleton).toBeEmptyDOMElement();
        expect(skeleton).toHaveClass("animate-pulse", "rounded-md", "bg-muted");
    });

    test("merges a custom class with the placeholder classes", () => {
        render(<Skeleton className="h-4 w-32" data-testid="skeleton" />);

        expect(screen.getByTestId("skeleton")).toHaveClass("h-4", "w-32", "animate-pulse", "bg-muted");
    });

    test("lets a custom class win over a conflicting default class", () => {
        render(<Skeleton className="rounded-full bg-slate-200" data-testid="skeleton" />);

        const skeleton = screen.getByTestId("skeleton");
        expect(skeleton).toHaveClass("rounded-full", "bg-slate-200");
        expect(skeleton).not.toHaveClass("rounded-md", "bg-muted");
    });

    test("lets a custom animation class replace the pulse animation", () => {
        render(<Skeleton className="animate-none" data-testid="skeleton" />);

        const skeleton = screen.getByTestId("skeleton");
        expect(skeleton).toHaveClass("animate-none");
        expect(skeleton).not.toHaveClass("animate-pulse");
    });

    test("keeps the placeholder classes when className is undefined", () => {
        render(<Skeleton className={undefined} data-testid="skeleton" />);

        expect(screen.getByTestId("skeleton")).toHaveClass("animate-pulse", "rounded-md", "bg-muted");
    });

    test("renders children when they are provided", () => {
        render(<Skeleton data-testid="skeleton">Loading…</Skeleton>);

        expect(screen.getByTestId("skeleton")).toHaveTextContent("Loading…");
    });

    test("passes native div attributes through", () => {
        render(<Skeleton id="avatar-placeholder" role="presentation" aria-hidden="true" data-testid="skeleton" />);

        const skeleton = screen.getByTestId("skeleton");
        expect(skeleton).toHaveAttribute("id", "avatar-placeholder");
        expect(skeleton).toHaveAttribute("role", "presentation");
        expect(skeleton).toHaveAttribute("aria-hidden", "true");
    });

    test("applies an inline style prop alongside the placeholder classes", () => {
        render(<Skeleton style={{ width: "120px" }} data-testid="skeleton" />);

        const skeleton = screen.getByTestId("skeleton");
        expect(skeleton.style.width).toBe("120px");
        expect(skeleton).toHaveClass("animate-pulse");
    });

    test("is not hidden from assistive technology by default", () => {
        render(<Skeleton data-testid="skeleton" />);

        const skeleton = screen.getByTestId("skeleton");
        expect(skeleton).not.toHaveAttribute("aria-hidden");
        expect(skeleton).not.toHaveAttribute("role");
    });

    test("hands a ref through to the rendered div even though Skeleton is not a forwardRef component", () => {
        const ref = { current: null as HTMLDivElement | null };
        render(<Skeleton {...({ ref } as unknown as React.HTMLAttributes<HTMLDivElement>)} data-testid="skeleton" />);

        expect(ref.current).toBe(screen.getByTestId("skeleton"));
    });

    test("renders each placeholder independently when several are used together", () => {
        render(
            <div>
                <Skeleton className="skeleton-line" />
                <Skeleton className="skeleton-line" />
                <Skeleton className="skeleton-line" />
            </div>,
        );

        expect(document.querySelectorAll(".skeleton-line")).toHaveLength(3);
    });
});
