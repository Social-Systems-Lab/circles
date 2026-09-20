import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { Progress } from "./progress";

const renderProgress = (props: React.ComponentProps<typeof Progress> = {}) => {
    const utils = render(<Progress {...props} />);
    const track = screen.getByRole("progressbar");

    return { ...utils, track, indicator: track.firstElementChild as HTMLElement };
};

describe("Progress", () => {
    test("renders a progressbar with the default bounds", () => {
        const { track } = renderProgress({ value: 40 });

        expect(track.tagName).toBe("DIV");
        expect(track).toHaveAttribute("aria-valuemin", "0");
        expect(track).toHaveAttribute("aria-valuemax", "100");
    });

    test("never reports aria-valuenow because the value is not forwarded to the Radix root", () => {
        const { track } = renderProgress({ value: 40 });

        expect(track).not.toHaveAttribute("aria-valuenow");
    });

    test("stays in the indeterminate state even when a value is given", () => {
        const { track, indicator } = renderProgress({ value: 40 });

        expect(track).toHaveAttribute("data-state", "indeterminate");
        expect(track).not.toHaveAttribute("data-value");
        expect(indicator).toHaveAttribute("data-state", "indeterminate");
    });

    test("ignores getValueLabel so no aria-valuetext is produced", () => {
        const { track } = renderProgress({ value: 40, getValueLabel: (value, max) => `${value} of ${max}` });

        expect(track).not.toHaveAttribute("aria-valuetext");
    });

    test("slides the indicator to match the value", () => {
        const { indicator } = renderProgress({ value: 40 });

        expect(indicator.style.transform).toBe("translateX(-60%)");
    });

    test("hides the indicator completely at zero", () => {
        const { indicator } = renderProgress({ value: 0 });

        expect(indicator.style.transform).toBe("translateX(-100%)");
    });

    test("fills the track at one hundred", () => {
        const { indicator } = renderProgress({ value: 100 });

        expect(indicator.style.transform).toBe("translateX(-0%)");
    });

    test("treats a missing value like zero", () => {
        const { indicator } = renderProgress();

        expect(indicator.style.transform).toBe("translateX(-100%)");
    });

    test("treats an explicitly undefined value like zero", () => {
        const { indicator } = renderProgress({ value: undefined });

        expect(indicator.style.transform).toBe("translateX(-100%)");
    });

    test("treats a null value like zero", () => {
        const { indicator } = renderProgress({ value: null });

        expect(indicator.style.transform).toBe("translateX(-100%)");
    });

    test("pushes the indicator past the track for a negative value instead of clamping to zero", () => {
        const { indicator } = renderProgress({ value: -10 });

        expect(indicator.style.transform).toBe("translateX(-110%)");
    });

    test("produces an invalid double-negative transform for a value above one hundred instead of clamping", () => {
        const { indicator } = renderProgress({ value: 150 });

        expect(indicator.style.transform).toBe("translateX(--50%)");
    });

    test("reports a custom max on the track but scales the indicator against one hundred anyway", () => {
        const { track, indicator } = renderProgress({ value: 25, max: 50 });

        expect(track).toHaveAttribute("aria-valuemax", "50");
        expect(track).toHaveAttribute("data-max", "50");
        expect(indicator.style.transform).toBe("translateX(-75%)");
    });

    test("styles the track as a rounded secondary-coloured bar", () => {
        const { track } = renderProgress({ value: 10 });

        expect(track).toHaveClass("relative", "h-4", "w-full", "overflow-hidden", "rounded-full", "bg-secondary");
    });

    test("keeps the accent colour and transition on the indicator", () => {
        const { indicator } = renderProgress({ value: 10 });

        expect(indicator).toHaveClass("h-full", "w-full", "bg-[#66a5ff]", "transition-all");
    });

    test("renders the indicator as the only child of the track", () => {
        const { track, indicator } = renderProgress({ value: 10 });

        expect(track.children).toHaveLength(1);
        expect(indicator).toBeEmptyDOMElement();
    });

    test("merges a custom class into the track", () => {
        const { track } = renderProgress({ value: 10, className: "progress-class" });

        expect(track).toHaveClass("progress-class", "rounded-full");
    });

    test("lets a custom class win over the default track height", () => {
        const { track } = renderProgress({ value: 10, className: "h-2" });

        expect(track).toHaveClass("h-2");
        expect(track).not.toHaveClass("h-4");
    });

    test("does not let a custom class reach the indicator", () => {
        const { indicator } = renderProgress({ value: 10, className: "progress-class" });

        expect(indicator).not.toHaveClass("progress-class");
    });

    test("passes native attributes through to the track", () => {
        const { track } = renderProgress({ value: 10, id: "upload-progress", "aria-label": "Upload progress" });

        expect(track).toHaveAttribute("id", "upload-progress");
        expect(track).toHaveAccessibleName("Upload progress");
    });

    test("forwards a ref to the track", () => {
        const ref = { current: null as HTMLDivElement | null };
        render(<Progress value={10} ref={ref} />);

        expect(ref.current).toBe(screen.getByRole("progressbar"));
    });

    test("updates the indicator when the value changes", () => {
        const { rerender, indicator } = renderProgress({ value: 20 });

        expect(indicator.style.transform).toBe("translateX(-80%)");

        rerender(<Progress value={80} />);

        expect(indicator.style.transform).toBe("translateX(-20%)");
    });
});
