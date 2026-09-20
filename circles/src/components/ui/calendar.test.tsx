import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Calendar } from "./calendar";

// A fixed month keeps every assertion independent of the day the suite runs on.
const MARCH_2026 = new Date("2026-03-15T12:00:00Z");
const MARCH_10 = new Date("2026-03-10T12:00:00Z");
const MARCH_11 = new Date("2026-03-11T12:00:00Z");
const MARCH_12 = new Date("2026-03-12T12:00:00Z");

const day = (label: string) => screen.getByRole("gridcell", { name: label });

describe("Calendar", () => {
    test("renders the month given by defaultMonth with its weekday headers", () => {
        render(<Calendar mode="single" defaultMonth={MARCH_2026} />);

        expect(screen.getByText("March 2026")).toBeInTheDocument();
        expect(screen.getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual([
            "Su",
            "Mo",
            "Tu",
            "We",
            "Th",
            "Fr",
            "Sa",
        ]);
    });

    test("renders every day of the month as a grid cell", () => {
        render(<Calendar mode="single" defaultMonth={MARCH_2026} showOutsideDays={false} />);

        const days = screen.getAllByRole("gridcell").filter((cell) => cell.textContent !== "");
        expect(days).toHaveLength(31);
        expect(days[0]).toHaveTextContent("1");
        expect(days[30]).toHaveTextContent("31");
    });

    test("reports the clicked date to onSelect", async () => {
        const picked: (Date | undefined)[] = [];
        render(<Calendar mode="single" defaultMonth={MARCH_2026} onSelect={(date) => picked.push(date)} />);

        await userEvent.click(day("12"));

        expect(picked).toHaveLength(1);
        expect(picked[0]?.getFullYear()).toBe(2026);
        expect(picked[0]?.getMonth()).toBe(2);
        expect(picked[0]?.getDate()).toBe(12);
    });

    test("marks the day passed through selected", () => {
        render(<Calendar mode="single" month={MARCH_2026} selected={MARCH_10} />);

        expect(day("10")).toHaveAttribute("aria-selected", "true");
        expect(day("10")).toHaveClass("bg-primary", "text-primary-foreground");
        expect(day("11")).not.toHaveAttribute("aria-selected", "true");
    });

    test("moves the highlight when the selected prop changes", () => {
        const { rerender } = render(<Calendar mode="single" month={MARCH_2026} selected={MARCH_10} />);
        expect(day("10")).toHaveAttribute("aria-selected", "true");

        rerender(<Calendar mode="single" month={MARCH_2026} selected={MARCH_12} />);

        expect(day("12")).toHaveAttribute("aria-selected", "true");
        expect(day("10")).not.toHaveAttribute("aria-selected", "true");
    });

    test("does not report a disabled day that is clicked", async () => {
        const picked: (Date | undefined)[] = [];
        render(
            <Calendar
                mode="single"
                defaultMonth={MARCH_2026}
                disabled={[MARCH_11]}
                onSelect={(date) => picked.push(date)}
            />,
        );
        const disabledDay = day("11");

        expect(disabledDay).toBeDisabled();
        expect(disabledDay).toHaveClass("text-muted-foreground", "opacity-50");

        await userEvent.click(disabledDay, { pointerEventsCheck: 0 });

        expect(picked).toEqual([]);
    });

    test("leaves the other days selectable next to a disabled one", async () => {
        const picked: (Date | undefined)[] = [];
        render(
            <Calendar
                mode="single"
                defaultMonth={MARCH_2026}
                disabled={[MARCH_11]}
                onSelect={(date) => picked.push(date)}
            />,
        );

        await userEvent.click(day("12"));

        expect(picked).toHaveLength(1);
        expect(picked[0]?.getDate()).toBe(12);
    });

    test("moves to the next and previous month with the navigation buttons", async () => {
        render(<Calendar mode="single" defaultMonth={MARCH_2026} />);

        await userEvent.click(screen.getByRole("button", { name: "Go to next month" }));
        expect(screen.getByText("April 2026")).toBeInTheDocument();
        expect(screen.queryByText("March 2026")).toBeNull();

        await userEvent.click(screen.getByRole("button", { name: "Go to previous month" }));
        await userEvent.click(screen.getByRole("button", { name: "Go to previous month" }));
        expect(screen.getByText("February 2026")).toBeInTheDocument();
    });

    test("crosses the year boundary when navigating past December", async () => {
        render(<Calendar mode="single" defaultMonth={new Date("2026-12-15T12:00:00Z")} />);

        await userEvent.click(screen.getByRole("button", { name: "Go to next month" }));

        expect(screen.getByText("January 2027")).toBeInTheDocument();
    });

    test("keeps a controlled month in place but reports the requested one", async () => {
        const months: string[] = [];
        render(<Calendar mode="single" month={MARCH_2026} onMonthChange={(month) => months.push(month.toISOString())} />);

        await userEvent.click(screen.getByRole("button", { name: "Go to next month" }));

        expect(screen.getByText("March 2026")).toBeInTheDocument();
        expect(months).toHaveLength(1);
        expect(new Date(months[0]).getMonth()).toBe(3);
    });

    test("follows a controlled month prop when it changes", () => {
        const { rerender } = render(<Calendar mode="single" month={MARCH_2026} />);

        rerender(<Calendar mode="single" month={new Date("2026-04-15T12:00:00Z")} />);

        expect(screen.getByText("April 2026")).toBeInTheDocument();
    });

    test("disables the button that would leave the allowed month range", () => {
        render(<Calendar mode="single" month={MARCH_2026} fromMonth={MARCH_2026} />);

        expect(screen.getByRole("button", { name: "Go to previous month" })).toBeDisabled();
        expect(screen.getByRole("button", { name: "Go to next month" })).toBeEnabled();
    });

    test("renders no navigation at all when only one month is allowed", () => {
        render(<Calendar mode="single" month={MARCH_2026} fromMonth={MARCH_2026} toMonth={MARCH_2026} />);

        expect(screen.queryAllByRole("button")).toHaveLength(0);
        expect(screen.getByText("March 2026")).toBeInTheDocument();
    });

    test("shows the days of the neighbouring months by default", () => {
        const { container } = render(<Calendar mode="single" month={MARCH_2026} />);

        expect(container.querySelectorAll(".day-outside").length).toBeGreaterThan(0);
        expect(screen.getAllByRole("gridcell").length).toBeGreaterThan(31);
    });

    test("hides the days of the neighbouring months when showOutsideDays is off", () => {
        const { container } = render(<Calendar mode="single" month={MARCH_2026} showOutsideDays={false} />);

        expect(container.querySelectorAll(".day-outside")).toHaveLength(0);
        expect(screen.getAllByRole("gridcell").filter((cell) => cell.textContent !== "")).toHaveLength(31);
    });

    test("highlights the whole range and its end in range mode", () => {
        const { container } = render(
            <Calendar mode="range" month={MARCH_2026} selected={{ from: MARCH_10, to: MARCH_12 }} />,
        );

        expect(container.querySelectorAll("[aria-selected='true']")).toHaveLength(3);
        expect(day("10")).toHaveAttribute("aria-selected", "true");
        expect(day("11")).toHaveAttribute("aria-selected", "true");
        expect(day("12")).toHaveAttribute("aria-selected", "true");
        expect(day("12")).toHaveClass("day-range-end");
    });

    test("selects several days independently in multiple mode", async () => {
        const picked: (Date[] | undefined)[] = [];
        render(
            <Calendar
                mode="multiple"
                defaultMonth={MARCH_2026}
                selected={[MARCH_10, MARCH_12]}
                onSelect={(dates) => picked.push(dates)}
            />,
        );

        expect(day("10")).toHaveAttribute("aria-selected", "true");
        expect(day("12")).toHaveAttribute("aria-selected", "true");

        await userEvent.click(day("11"));

        expect(picked[0]?.map((date) => date.getDate())).toEqual([10, 12, 11]);
    });

    test("renders one grid per month when several months are requested", () => {
        render(<Calendar mode="single" defaultMonth={MARCH_2026} numberOfMonths={2} />);

        expect(screen.getByText("March 2026")).toBeInTheDocument();
        expect(screen.getByText("April 2026")).toBeInTheDocument();
        expect(screen.getAllByRole("grid")).toHaveLength(2);
    });

    test("renders a footer under the month when one is given", () => {
        render(<Calendar mode="single" defaultMonth={MARCH_2026} footer={<span>Pick a start date</span>} />);

        expect(screen.getByText("Pick a start date")).toBeInTheDocument();
    });

    test("merges a custom class into the calendar root", () => {
        const { container } = render(<Calendar mode="single" month={MARCH_2026} className="calendar-class" />);

        expect(container.firstElementChild).toHaveClass("calendar-class", "p-3");
    });

    test("lets a caller override a single part through classNames", () => {
        render(
            <Calendar mode="single" month={MARCH_2026} classNames={{ caption_label: "caption-class" }} />,
        );

        const caption = screen.getByText("March 2026");
        expect(caption).toHaveClass("caption-class");
        expect(caption).not.toHaveClass("font-medium");
    });

    test("labels the grid with the visible month", () => {
        render(<Calendar mode="single" month={MARCH_2026} />);

        const grid = screen.getByRole("grid");
        expect(document.getElementById(grid.getAttribute("aria-labelledby") ?? "")).toHaveTextContent("March 2026");
    });
});
