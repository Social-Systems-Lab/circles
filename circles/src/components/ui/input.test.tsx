import { describe, expect, test } from "bun:test";
import * as React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Input } from "./input";

describe("Input", () => {
    test("renders a text box even though no type attribute is set", () => {
        render(<Input aria-label="Title" />);

        const input = screen.getByRole("textbox", { name: "Title" });
        expect(input.tagName).toBe("INPUT");
        expect(input).not.toHaveAttribute("type");
        expect((input as HTMLInputElement).type).toBe("text");
    });

    test("forwards the requested type to the input element", () => {
        render(<Input type="password" aria-label="Password" />);

        expect(screen.getByLabelText("Password")).toHaveAttribute("type", "password");
    });

    test("shows the placeholder and records what the user types", async () => {
        render(<Input placeholder="you@example.com" />);

        const input = screen.getByPlaceholderText("you@example.com");
        expect(input).toHaveValue("");

        await userEvent.type(input, "ada@example.com");

        expect(input).toHaveValue("ada@example.com");
    });

    test("reports the value after every keystroke to onChange", async () => {
        const values: string[] = [];
        render(<Input aria-label="Name" onChange={(event) => values.push(event.target.value)} />);

        await userEvent.type(screen.getByRole("textbox", { name: "Name" }), "Ada");

        expect(values).toEqual(["A", "Ad", "Ada"]);
    });

    test("starts from defaultValue and still lets the user edit it", async () => {
        render(<Input aria-label="City" defaultValue="Oslo" />);

        const input = screen.getByRole("textbox", { name: "City" });
        expect(input).toHaveValue("Oslo");

        await userEvent.type(input, "!");

        expect(input).toHaveValue("Oslo!");
    });

    test("keeps a controlled value unchanged when the parent ignores onChange", async () => {
        let changes = 0;
        render(<Input aria-label="Locked" value="fixed" onChange={() => (changes += 1)} />);

        const input = screen.getByRole("textbox", { name: "Locked" });
        await userEvent.type(input, "abc");

        expect(input).toHaveValue("fixed");
        expect(changes).toBe(3);
    });

    test("follows a controlled value that the parent stores in state", async () => {
        const Controlled = () => {
            const [value, setValue] = React.useState("");
            return <Input aria-label="Search" value={value} onChange={(event) => setValue(event.target.value.toUpperCase())} />;
        };
        render(<Controlled />);

        await userEvent.type(screen.getByRole("textbox", { name: "Search" }), "abc");

        expect(screen.getByRole("textbox", { name: "Search" })).toHaveValue("ABC");
    });

    test("does not accept typing or fire onChange when disabled", async () => {
        let changes = 0;
        render(<Input aria-label="Disabled field" disabled onChange={() => (changes += 1)} />);

        const input = screen.getByRole("textbox", { name: "Disabled field" });
        expect(input).toBeDisabled();

        await userEvent.type(input, "nope", { pointerEventsCheck: 0 });

        expect(input).toHaveValue("");
        expect(changes).toBe(0);
    });

    test("does not accept typing when readOnly but still shows its value", async () => {
        let changes = 0;
        render(<Input aria-label="Read only" readOnly defaultValue="cannot touch" onChange={() => (changes += 1)} />);

        const input = screen.getByRole("textbox", { name: "Read only" });
        await userEvent.type(input, "abc");

        expect(input).toHaveValue("cannot touch");
        expect(changes).toBe(0);
        expect(input).toHaveAttribute("readonly");
    });

    test("stops accepting characters once maxLength is reached", async () => {
        render(<Input aria-label="Code" maxLength={4} />);

        const input = screen.getByRole("textbox", { name: "Code" });
        await userEvent.type(input, "123456");

        expect(input).toHaveValue("1234");
    });

    test("exposes required and aria-invalid so forms can flag the field", () => {
        render(<Input aria-label="Email" required aria-invalid="true" />);

        const input = screen.getByRole("textbox", { name: "Email" });
        expect(input).toBeRequired();
        expect(input).toBeInvalid();
    });

    test("links its help text through aria-describedby", () => {
        render(
            <>
                <Input aria-label="Handle" aria-describedby="handle-hint" />
                <p id="handle-hint">Letters and numbers only</p>
            </>,
        );

        expect(screen.getByRole("textbox", { name: "Handle" })).toHaveAccessibleDescription(
            "Letters and numbers only",
        );
    });

    test("merges custom classes with the base input classes", () => {
        render(<Input aria-label="Styled" className="custom-class" />);

        const input = screen.getByRole("textbox", { name: "Styled" });
        expect(input).toHaveClass("custom-class");
        expect(input).toHaveClass("rounded-md", "w-full");
    });

    test("lets a custom class override a conflicting base class", () => {
        render(<Input aria-label="Tall" className="h-20" />);

        const input = screen.getByRole("textbox", { name: "Tall" });
        expect(input).toHaveClass("h-20");
        expect(input).not.toHaveClass("h-11");
    });

    test("forwards a ref to the underlying input", () => {
        let captured: HTMLInputElement | null = null;
        render(<Input aria-label="With ref" ref={(node) => {
                captured = node;
            }} />);

        expect(captured).not.toBeNull();
        expect((captured as unknown as HTMLInputElement).tagName).toBe("INPUT");
    });

    test("passes through native input attributes", () => {
        render(<Input aria-label="Amount" name="amount" type="number" min={0} max={10} step={2} />);

        const input = screen.getByRole("spinbutton", { name: "Amount" });
        expect(input).toHaveAttribute("name", "amount");
        expect(input).toHaveAttribute("min", "0");
        expect(input).toHaveAttribute("max", "10");
        expect(input).toHaveAttribute("step", "2");
    });

    test("submits its value with the surrounding form", async () => {
        let submitted: string | null = null;
        render(
            <form
                onSubmit={(event) => {
                    event.preventDefault();
                    submitted = new FormData(event.currentTarget).get("nickname") as string;
                }}
            >
                <Input aria-label="Nickname" name="nickname" defaultValue="ada" />
                <button type="submit">Save</button>
            </form>,
        );

        await userEvent.click(screen.getByRole("button", { name: "Save" }));

        expect(submitted).toBe("ada");
    });
});
