import { describe, expect, test } from "bun:test";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "./data-table";

type Member = {
    name: string;
    age: number;
};

const members: Member[] = [
    { name: "Cara", age: 30 },
    { name: "Ada", age: 4 },
    { name: "Bob", age: 100 },
];

const plainColumns: ColumnDef<Member>[] = [
    { accessorKey: "name", header: "Name" },
    { accessorKey: "age", header: "Age" },
];

const sortableColumns: ColumnDef<Member>[] = [
    {
        accessorKey: "name",
        header: ({ column }) => (
            <button type="button" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
                Name
            </button>
        ),
    },
    { accessorKey: "age", header: "Age" },
];

const bodyRowTexts = () => screen.getAllByRole("row").slice(1).map((row) => row.textContent);

describe("DataTable", () => {
    test("renders a header cell per column and a row per record", () => {
        render(<DataTable columns={plainColumns} data={members} />);

        expect(screen.getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual(["Name", "Age"]);
        expect(bodyRowTexts()).toEqual(["Cara30", "Ada4", "Bob100"]);
    });

    test("keeps the records in their original order until a sort is requested", () => {
        render(<DataTable columns={plainColumns} data={members} />);

        expect(screen.getAllByRole("cell").map((cell) => cell.textContent)).toEqual([
            "Cara",
            "30",
            "Ada",
            "4",
            "Bob",
            "100",
        ]);
    });

    test("shows a single full width placeholder row when there is no data", () => {
        render(<DataTable columns={plainColumns} data={[]} />);

        const placeholder = screen.getByRole("cell", { name: "No results." });
        expect(placeholder).toHaveAttribute("colspan", "2");
        expect(placeholder).toHaveClass("h-24", "text-center");
        expect(screen.getAllByRole("row")).toHaveLength(2);
    });

    test("still renders the column headers when there is no data", () => {
        render(<DataTable columns={plainColumns} data={[]} />);

        expect(screen.getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual(["Name", "Age"]);
    });

    test("renders a single record without a placeholder row", () => {
        render(<DataTable columns={plainColumns} data={[{ name: "Ada", age: 36 }]} />);

        expect(bodyRowTexts()).toEqual(["Ada36"]);
        expect(screen.queryByText("No results.")).toBeNull();
    });

    test("sorts ascending on the first header click and descending on the second", async () => {
        render(<DataTable columns={sortableColumns} data={members} />);
        const header = screen.getByRole("button", { name: "Name" });

        await userEvent.click(header);
        expect(bodyRowTexts()).toEqual(["Ada4", "Bob100", "Cara30"]);

        await userEvent.click(header);
        expect(bodyRowTexts()).toEqual(["Cara30", "Bob100", "Ada4"]);
    });

    test("sorts numbers by value rather than alphabetically", async () => {
        const numericColumns: ColumnDef<Member>[] = [
            {
                accessorKey: "age",
                header: ({ column }) => (
                    <button type="button" onClick={() => column.toggleSorting(false)}>
                        Age
                    </button>
                ),
            },
        ];
        render(<DataTable columns={numericColumns} data={members} />);

        await userEvent.click(screen.getByRole("button", { name: "Age" }));

        expect(bodyRowTexts()).toEqual(["4", "30", "100"]);
    });

    test("exposes the sort state to the header renderer", async () => {
        const stateColumns: ColumnDef<Member>[] = [
            {
                accessorKey: "name",
                header: ({ column }) => (
                    <button type="button" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
                        Name {String(column.getIsSorted())}
                    </button>
                ),
            },
        ];
        render(<DataTable columns={stateColumns} data={members} />);

        expect(screen.getByRole("columnheader")).toHaveTextContent("Name false");

        await userEvent.click(screen.getByRole("button"));
        expect(screen.getByRole("columnheader")).toHaveTextContent("Name asc");

        await userEvent.click(screen.getByRole("button"));
        expect(screen.getByRole("columnheader")).toHaveTextContent("Name desc");
    });

    test("renders custom cell content returned by a column definition", () => {
        const customColumns: ColumnDef<Member>[] = [
            {
                id: "display",
                accessorFn: (row) => `${row.name} (${row.age})`,
                header: () => <span>Person</span>,
                cell: ({ getValue }) => <strong>{String(getValue())}</strong>,
            },
        ];
        render(<DataTable columns={customColumns} data={[{ name: "Ada", age: 36 }]} />);

        expect(screen.getByRole("columnheader")).toHaveTextContent("Person");
        expect(screen.getByText("Ada (36)").tagName).toBe("STRONG");
    });

    test("renders an empty header cell for a placeholder in a grouped header row", () => {
        const groupedColumns: ColumnDef<Member>[] = [
            { header: "Identity", columns: [{ accessorKey: "name", header: "Name" }] },
            { accessorKey: "age", header: "Age" },
        ];
        render(<DataTable columns={groupedColumns} data={[{ name: "Ada", age: 36 }]} />);

        const headerRows = screen.getAllByRole("row").slice(0, 2);
        expect(headerRows[0].textContent).toBe("Identity");
        expect(headerRows[1].textContent).toBe("NameAge");
        expect(headerRows[0].querySelectorAll("th")).toHaveLength(2);
    });

    test("re-renders the rows when the data prop changes", () => {
        const { rerender } = render(<DataTable columns={plainColumns} data={[{ name: "Ada", age: 36 }]} />);
        expect(bodyRowTexts()).toEqual(["Ada36"]);

        rerender(<DataTable columns={plainColumns} data={[{ name: "Grace", age: 45 }]} />);
        expect(bodyRowTexts()).toEqual(["Grace45"]);

        rerender(<DataTable columns={plainColumns} data={[]} />);
        expect(screen.getByText("No results.")).toBeInTheDocument();
    });

    test("keeps the requested sort order after the data prop changes", async () => {
        const { rerender } = render(<DataTable columns={sortableColumns} data={members} />);

        await userEvent.click(screen.getByRole("button", { name: "Name" }));
        await act(async () => {
            rerender(<DataTable columns={sortableColumns} data={[...members, { name: "Alan", age: 41 }]} />);
        });

        expect(bodyRowTexts()).toEqual(["Ada4", "Alan41", "Bob100", "Cara30"]);
    });

    test("renders empty cells for records missing an accessor value", () => {
        const partial = [{ name: "Ada" }] as Member[];
        render(<DataTable columns={plainColumns} data={partial} />);

        const cells = screen.getAllByRole("cell");
        expect(cells[0]).toHaveTextContent("Ada");
        expect(cells[1].textContent).toBe("");
    });

    test("wraps the table in a bordered container", () => {
        const { container } = render(<DataTable columns={plainColumns} data={members} />);

        expect(container.firstElementChild).toHaveClass("rounded-md", "border");
        expect(screen.getByRole("table")).toBeInTheDocument();
    });

    test("marks every body row with data-state=false because row selection is not enabled", () => {
        render(<DataTable columns={plainColumns} data={members} />);

        for (const row of screen.getAllByRole("row").slice(1)) {
            expect(row).toHaveAttribute("data-state", "false");
        }
    });
});
