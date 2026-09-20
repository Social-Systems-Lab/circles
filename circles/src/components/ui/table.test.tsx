import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { Table, TableBody, TableCaption, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "./table";

const renderTable = (caption?: React.ReactNode) =>
    render(
        <Table>
            {caption ? <TableCaption>{caption}</TableCaption> : null}
            <TableHeader>
                <TableRow>
                    <TableHead>Member</TableHead>
                    <TableHead>Role</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                <TableRow>
                    <TableCell>Ada</TableCell>
                    <TableCell>Admin</TableCell>
                </TableRow>
                <TableRow>
                    <TableCell>Grace</TableCell>
                    <TableCell>Member</TableCell>
                </TableRow>
            </TableBody>
            <TableFooter>
                <TableRow>
                    <TableCell colSpan={2}>2 members</TableCell>
                </TableRow>
            </TableFooter>
        </Table>,
    );

describe("Table", () => {
    test("renders a table element exposing every header and data cell", () => {
        renderTable();

        const table = screen.getByRole("table");
        expect(table.tagName).toBe("TABLE");
        expect(screen.getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual(["Member", "Role"]);
        expect(screen.getByRole("cell", { name: "Ada" })).toBeInTheDocument();
        expect(screen.getByRole("cell", { name: "Grace" })).toBeInTheDocument();
    });

    test("groups rows into a head, a body and a foot section", () => {
        const { container } = renderTable();

        expect(container.querySelector("thead")).not.toBeNull();
        expect(container.querySelector("tbody")?.querySelectorAll("tr")).toHaveLength(2);
        expect(container.querySelector("tfoot")).toHaveTextContent("2 members");
    });

    test("wraps the table in a horizontally scrollable container", () => {
        const { container } = renderTable();

        const wrapper = container.firstElementChild as HTMLElement;
        expect(wrapper.tagName).toBe("DIV");
        expect(wrapper).toHaveClass("overflow-auto");
        expect(wrapper.firstElementChild?.tagName).toBe("TABLE");
    });

    test("renders the caption as the table's caption element", () => {
        renderTable("Circle members");

        const table = screen.getByRole("table");
        const caption = table.querySelector("caption");
        expect(caption).toHaveTextContent("Circle members");
        expect(caption?.parentElement).toBe(table);
    });

    test("renders no caption element when TableCaption is omitted", () => {
        renderTable();

        expect(screen.getByRole("table").querySelector("caption")).toBeNull();
    });

    test("renders a table with only headers when the body has no rows", () => {
        render(
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Member</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody />
            </Table>,
        );

        expect(screen.getAllByRole("row")).toHaveLength(1);
        expect(screen.queryAllByRole("cell")).toHaveLength(0);
    });

    test("marks a row as selected through the data-state attribute", () => {
        render(
            <Table>
                <TableBody>
                    <TableRow data-state="selected">
                        <TableCell>Ada</TableCell>
                    </TableRow>
                </TableBody>
            </Table>,
        );

        const row = screen.getByRole("row");
        expect(row).toHaveAttribute("data-state", "selected");
        expect(row).toHaveClass("data-[state=selected]:bg-muted");
    });

    test("merges custom classes into every table part", () => {
        const { container } = render(
            <Table className="table-class">
                <TableCaption className="caption-class">Caption</TableCaption>
                <TableHeader className="header-class">
                    <TableRow className="row-class">
                        <TableHead className="head-class">Member</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody className="body-class">
                    <TableRow>
                        <TableCell className="cell-class">Ada</TableCell>
                    </TableRow>
                </TableBody>
                <TableFooter className="footer-class">
                    <TableRow>
                        <TableCell>Total</TableCell>
                    </TableRow>
                </TableFooter>
            </Table>,
        );

        expect(screen.getByRole("table")).toHaveClass("table-class", "caption-bottom");
        expect(container.querySelector("caption")).toHaveClass("caption-class", "text-sm");
        expect(container.querySelector("thead")).toHaveClass("header-class");
        expect(container.querySelector("tbody")).toHaveClass("body-class");
        expect(container.querySelector("tfoot")).toHaveClass("footer-class", "border-t");
        expect(screen.getByRole("columnheader")).toHaveClass("head-class", "align-middle");
        expect(screen.getByRole("cell", { name: "Ada" })).toHaveClass("cell-class", "align-middle");
        expect(screen.getAllByRole("row")[0]).toHaveClass("row-class", "border-b");
    });

    test("passes native cell attributes through to the DOM", () => {
        render(
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead scope="col" abbr="Mbr">
                            Member
                        </TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    <TableRow data-testid="data-row">
                        <TableCell colSpan={2} headers="member">
                            Ada
                        </TableCell>
                    </TableRow>
                </TableBody>
            </Table>,
        );

        expect(screen.getByRole("columnheader")).toHaveAttribute("scope", "col");
        expect(screen.getByRole("columnheader")).toHaveAttribute("abbr", "Mbr");
        expect(screen.getByRole("cell")).toHaveAttribute("colspan", "2");
        expect(screen.getByTestId("data-row")).toBeInTheDocument();
    });

    test("forwards refs to the underlying DOM elements", () => {
        const captured: Record<string, HTMLElement | null> = {};
        render(
            <Table
                ref={(node) => {
                    captured.table = node;
                }}
            >
                <TableHeader
                    ref={(node) => {
                        captured.header = node;
                    }}
                >
                    <TableRow
                        ref={(node) => {
                            captured.row = node;
                        }}
                    >
                        <TableHead
                            ref={(node) => {
                                captured.head = node;
                            }}
                        >
                            Member
                        </TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody
                    ref={(node) => {
                        captured.body = node;
                    }}
                >
                    <TableRow>
                        <TableCell
                            ref={(node) => {
                                captured.cell = node;
                            }}
                        >
                            Ada
                        </TableCell>
                    </TableRow>
                </TableBody>
            </Table>,
        );

        expect(captured.table?.tagName).toBe("TABLE");
        expect(captured.header?.tagName).toBe("THEAD");
        expect(captured.body?.tagName).toBe("TBODY");
        expect(captured.row?.tagName).toBe("TR");
        expect(captured.head?.tagName).toBe("TH");
        expect(captured.cell?.tagName).toBe("TD");
    });
});
