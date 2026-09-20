import { describe, expect, mock, test } from "bun:test";
import * as React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Slider } from "./slider";

describe("Slider", () => {
    test("renders a thumb sitting at the minimum with the default range", () => {
        render(<Slider />);

        const thumb = screen.getByRole("slider");
        expect(thumb).toHaveAttribute("aria-valuemin", "0");
        expect(thumb).toHaveAttribute("aria-valuemax", "100");
        expect(thumb).toHaveAttribute("aria-valuenow", "0");
        expect(thumb).toHaveAttribute("aria-orientation", "horizontal");
    });

    test("leaves the thumb unnamed because aria-label lands on the root instead", () => {
        render(<Slider aria-label="Volume" defaultValue={[50]} />);

        const thumb = screen.getByRole("slider");
        expect(thumb).not.toHaveAttribute("aria-label");
        expect(screen.queryByRole("slider", { name: "Volume" })).toBeNull();
        expect(thumb.parentElement?.parentElement).toHaveAttribute("aria-label", "Volume");
    });

    test("starts at the value given by defaultValue", () => {
        render(<Slider defaultValue={[35]} />);

        expect(screen.getByRole("slider")).toHaveAttribute("aria-valuenow", "35");
    });

    test("reports the custom min and max to assistive technology", () => {
        render(<Slider min={10} max={20} defaultValue={[12]} />);

        const thumb = screen.getByRole("slider");
        expect(thumb).toHaveAttribute("aria-valuemin", "10");
        expect(thumb).toHaveAttribute("aria-valuemax", "20");
        expect(thumb).toHaveAttribute("aria-valuenow", "12");
    });

    test("moves one step up with the right arrow and one step down with the left arrow", async () => {
        render(<Slider defaultValue={[50]} />);

        const thumb = screen.getByRole("slider");
        thumb.focus();

        await userEvent.keyboard("{ArrowRight}");
        expect(thumb).toHaveAttribute("aria-valuenow", "51");

        await userEvent.keyboard("{ArrowLeft}{ArrowLeft}");
        expect(thumb).toHaveAttribute("aria-valuenow", "49");
    });

    test("moves by the configured step size", async () => {
        render(<Slider defaultValue={[50]} step={5} />);

        const thumb = screen.getByRole("slider");
        thumb.focus();
        await userEvent.keyboard("{ArrowRight}");

        expect(thumb).toHaveAttribute("aria-valuenow", "55");
    });

    test("snaps an off-grid starting value onto the step grid on the first key press", async () => {
        render(<Slider defaultValue={[23]} step={10} />);

        const thumb = screen.getByRole("slider");
        expect(thumb).toHaveAttribute("aria-valuenow", "23");

        thumb.focus();
        await userEvent.keyboard("{ArrowRight}");

        expect(thumb).toHaveAttribute("aria-valuenow", "30");
    });

    test("jumps to the minimum with Home and to the maximum with End", async () => {
        render(<Slider defaultValue={[50]} min={10} max={90} />);

        const thumb = screen.getByRole("slider");
        thumb.focus();

        await userEvent.keyboard("{Home}");
        expect(thumb).toHaveAttribute("aria-valuenow", "10");

        await userEvent.keyboard("{End}");
        expect(thumb).toHaveAttribute("aria-valuenow", "90");
    });

    test("moves ten steps at a time with PageUp and PageDown", async () => {
        render(<Slider defaultValue={[50]} step={2} />);

        const thumb = screen.getByRole("slider");
        thumb.focus();

        await userEvent.keyboard("{PageUp}");
        expect(thumb).toHaveAttribute("aria-valuenow", "70");

        await userEvent.keyboard("{PageDown}");
        expect(thumb).toHaveAttribute("aria-valuenow", "50");
    });

    test("moves ten steps at a time when an arrow key is pressed with Shift", async () => {
        render(<Slider defaultValue={[50]} />);

        const thumb = screen.getByRole("slider");
        thumb.focus();
        await userEvent.keyboard("{Shift>}{ArrowLeft}{/Shift}");

        expect(thumb).toHaveAttribute("aria-valuenow", "40");
    });

    test("clamps at the maximum instead of stepping past it", async () => {
        render(<Slider defaultValue={[100]} />);

        const thumb = screen.getByRole("slider");
        thumb.focus();
        await userEvent.keyboard("{ArrowRight}");

        expect(thumb).toHaveAttribute("aria-valuenow", "100");
    });

    test("clamps at the minimum instead of stepping below it", async () => {
        render(<Slider defaultValue={[0]} />);

        const thumb = screen.getByRole("slider");
        thumb.focus();
        await userEvent.keyboard("{ArrowLeft}");

        expect(thumb).toHaveAttribute("aria-valuenow", "0");
    });

    test("reports every keyboard change to onValueChange as an array", async () => {
        const onValueChange = mock((_value: number[]) => {});
        render(<Slider defaultValue={[50]} onValueChange={onValueChange} />);

        screen.getByRole("slider").focus();
        await userEvent.keyboard("{ArrowRight}{ArrowRight}");

        expect(onValueChange.mock.calls).toEqual([[[51]], [[52]]]);
    });

    test("commits each keyboard change to onValueCommit", async () => {
        const onValueCommit = mock((_value: number[]) => {});
        render(<Slider defaultValue={[50]} onValueCommit={onValueCommit} />);

        screen.getByRole("slider").focus();
        await userEvent.keyboard("{ArrowRight}");

        expect(onValueCommit.mock.calls).toEqual([[[51]]]);
    });

    test("does not commit when a key press leaves the value unchanged", async () => {
        const onValueCommit = mock((_value: number[]) => {});
        render(<Slider defaultValue={[100]} onValueCommit={onValueCommit} />);

        screen.getByRole("slider").focus();
        await userEvent.keyboard("{ArrowRight}");

        expect(onValueCommit.mock.calls).toEqual([]);
    });

    test("keeps a controlled value fixed when the parent ignores the change", async () => {
        const onValueChange = mock((_value: number[]) => {});
        render(<Slider value={[40]} onValueChange={onValueChange} />);

        const thumb = screen.getByRole("slider");
        thumb.focus();
        await userEvent.keyboard("{ArrowRight}");

        expect(thumb).toHaveAttribute("aria-valuenow", "40");
        expect(onValueChange.mock.calls).toEqual([[[41]]]);
    });

    test("follows a controlled value that the parent stores in state", async () => {
        const Controlled = () => {
            const [value, setValue] = React.useState([40]);
            return <Slider value={value} onValueChange={setValue} />;
        };
        render(<Controlled />);

        const thumb = screen.getByRole("slider");
        thumb.focus();
        await userEvent.keyboard("{ArrowRight}");

        expect(thumb).toHaveAttribute("aria-valuenow", "41");
    });

    test("takes the thumb out of the tab order and ignores keys when disabled", () => {
        const onValueChange = mock((_value: number[]) => {});
        render(<Slider defaultValue={[50]} disabled onValueChange={onValueChange} />);

        const thumb = screen.getByRole("slider");
        expect(thumb).not.toHaveAttribute("tabindex");
        expect(thumb).toHaveAttribute("data-disabled", "");

        fireEvent.keyDown(thumb, { key: "ArrowRight" });

        expect(thumb).toHaveAttribute("aria-valuenow", "50");
        expect(onValueChange.mock.calls).toEqual([]);
    });

    test("marks the whole control as disabled for assistive technology", () => {
        render(<Slider defaultValue={[50]} disabled className="slider-root" />);

        const root = document.querySelector(".slider-root");
        expect(root).toHaveAttribute("aria-disabled", "true");
        expect(root).toHaveAttribute("data-disabled", "");
    });

    test("renders only one thumb even when several values are supplied", () => {
        render(<Slider defaultValue={[20, 80]} />);

        const thumbs = screen.getAllByRole("slider");
        expect(thumbs).toHaveLength(1);
        expect(thumbs[0]).toHaveAttribute("aria-valuenow", "20");
        expect(thumbs[0]).toHaveAttribute("aria-label", "Minimum");
    });

    test("only moves the first value of a multi value slider with the keyboard", async () => {
        const onValueChange = mock((_value: number[]) => {});
        render(<Slider defaultValue={[20, 80]} onValueChange={onValueChange} />);

        const thumb = screen.getByRole("slider", { name: "Minimum" });
        thumb.focus();
        await userEvent.keyboard("{ArrowRight}");

        expect(onValueChange.mock.calls).toEqual([[[21, 80]]]);
        expect(thumb).toHaveAttribute("aria-valuenow", "21");
    });

    test("switches the reported orientation when rendered vertically", () => {
        render(<Slider orientation="vertical" defaultValue={[50]} />);

        const thumb = screen.getByRole("slider");
        expect(thumb).toHaveAttribute("aria-orientation", "vertical");
        expect(thumb).toHaveAttribute("data-orientation", "vertical");
    });

    test("sizes the filled range to match the current value", async () => {
        render(<Slider defaultValue={[50]} className="slider-root" />);

        const range = document.querySelector<HTMLElement>(".slider-root .bg-primary");
        expect(range?.style.left).toBe("0%");
        expect(range?.style.right).toBe("50%");

        screen.getByRole("slider").focus();
        await userEvent.keyboard("{End}");

        expect(range?.style.right).toBe("0%");
    });

    test("merges custom classes with the base root classes", () => {
        render(<Slider className="custom-class" defaultValue={[50]} />);

        const root = document.querySelector(".custom-class");
        expect(root).toHaveClass("relative", "flex", "w-full", "items-center");
    });

    test("forwards a ref to the slider root", () => {
        let captured: HTMLSpanElement | null = null;
        render(<Slider defaultValue={[50]} ref={(node) => {
                captured = node;
            }} />);

        expect(captured).not.toBeNull();
        expect((captured as unknown as HTMLSpanElement).tagName).toBe("SPAN");
    });

    test("keeps a hidden input in sync inside a form so the value can be submitted", async () => {
        render(
            <form>
                <Slider name="volume" defaultValue={[50]} />
            </form>,
        );

        const hidden = document.querySelector<HTMLInputElement>('input[name="volume"]');
        expect(hidden?.value).toBe("50");

        screen.getByRole("slider").focus();
        await userEvent.keyboard("{ArrowRight}");

        expect(hidden?.value).toBe("51");
    });

    test("renders no hidden input when used outside a form", () => {
        render(<Slider name="volume" defaultValue={[50]} />);

        expect(document.querySelector('input[name="volume"]')).toBeNull();
    });
});
