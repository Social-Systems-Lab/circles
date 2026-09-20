import { describe, expect, test } from "bun:test";
import * as React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Textarea } from "./textarea";

describe("Textarea", () => {
    test("renders a textarea element exposed as a text box", () => {
        render(<Textarea aria-label="Bio" />);

        const textarea = screen.getByRole("textbox", { name: "Bio" });
        expect(textarea.tagName).toBe("TEXTAREA");
    });

    test("shows the placeholder and records what the user types", async () => {
        render(<Textarea placeholder="Tell us about yourself" />);

        const textarea = screen.getByPlaceholderText("Tell us about yourself");
        expect(textarea).toHaveValue("");

        await userEvent.type(textarea, "I build circles");

        expect(textarea).toHaveValue("I build circles");
    });

    test("keeps the newlines the user types", async () => {
        render(<Textarea aria-label="Notes" />);

        const textarea = screen.getByRole("textbox", { name: "Notes" });
        await userEvent.type(textarea, "first{Enter}second");

        expect(textarea).toHaveValue("first\nsecond");
    });

    test("reports the value after every keystroke to onChange", async () => {
        const values: string[] = [];
        render(<Textarea aria-label="Message" onChange={(event) => values.push(event.target.value)} />);

        await userEvent.type(screen.getByRole("textbox", { name: "Message" }), "hi");

        expect(values).toEqual(["h", "hi"]);
    });

    test("starts from defaultValue and still lets the user edit it", async () => {
        render(<Textarea aria-label="Draft" defaultValue="Hello" />);

        const textarea = screen.getByRole("textbox", { name: "Draft" });
        expect(textarea).toHaveValue("Hello");

        await userEvent.type(textarea, " there");

        expect(textarea).toHaveValue("Hello there");
    });

    test("keeps a controlled value unchanged when the parent ignores onChange", async () => {
        let changes = 0;
        render(<Textarea aria-label="Locked" value="fixed" onChange={() => (changes += 1)} />);

        const textarea = screen.getByRole("textbox", { name: "Locked" });
        await userEvent.type(textarea, "abc");

        expect(textarea).toHaveValue("fixed");
        expect(changes).toBe(3);
    });

    test("follows a controlled value that the parent stores in state", async () => {
        const Controlled = () => {
            const [value, setValue] = React.useState("");
            return <Textarea aria-label="Comment" value={value} onChange={(event) => setValue(event.target.value)} />;
        };
        render(<Controlled />);

        await userEvent.type(screen.getByRole("textbox", { name: "Comment" }), "typed");

        expect(screen.getByRole("textbox", { name: "Comment" })).toHaveValue("typed");
    });

    test("does not accept typing or fire onChange when disabled", async () => {
        let changes = 0;
        render(<Textarea aria-label="Disabled area" disabled onChange={() => (changes += 1)} />);

        const textarea = screen.getByRole("textbox", { name: "Disabled area" });
        expect(textarea).toBeDisabled();

        await userEvent.type(textarea, "nope", { pointerEventsCheck: 0 });

        expect(textarea).toHaveValue("");
        expect(changes).toBe(0);
    });

    test("does not accept typing when readOnly but still shows its value", async () => {
        let changes = 0;
        render(<Textarea aria-label="Read only" readOnly defaultValue="published" onChange={() => (changes += 1)} />);

        const textarea = screen.getByRole("textbox", { name: "Read only" });
        await userEvent.type(textarea, "abc");

        expect(textarea).toHaveValue("published");
        expect(changes).toBe(0);
        expect(textarea).toHaveAttribute("readonly");
    });

    test("stops accepting characters once maxLength is reached", async () => {
        render(<Textarea aria-label="Short" maxLength={3} />);

        const textarea = screen.getByRole("textbox", { name: "Short" });
        await userEvent.type(textarea, "abcdef");

        expect(textarea).toHaveValue("abc");
    });

    test("exposes required and aria-invalid so forms can flag the field", () => {
        render(<Textarea aria-label="Reason" required aria-invalid="true" />);

        const textarea = screen.getByRole("textbox", { name: "Reason" });
        expect(textarea).toBeRequired();
        expect(textarea).toBeInvalid();
    });

    test("links its help text through aria-describedby", () => {
        render(
            <>
                <Textarea aria-label="Summary" aria-describedby="summary-hint" />
                <p id="summary-hint">Keep it under 200 characters</p>
            </>,
        );

        expect(screen.getByRole("textbox", { name: "Summary" })).toHaveAccessibleDescription(
            "Keep it under 200 characters",
        );
    });

    test("passes rows through to the textarea element", () => {
        render(<Textarea aria-label="Sized" rows={8} />);

        expect(screen.getByRole("textbox", { name: "Sized" })).toHaveAttribute("rows", "8");
    });

    test("merges custom classes with the base textarea classes", () => {
        render(<Textarea aria-label="Styled" className="custom-class" />);

        const textarea = screen.getByRole("textbox", { name: "Styled" });
        expect(textarea).toHaveClass("custom-class");
        expect(textarea).toHaveClass("rounded-md", "w-full");
    });

    test("lets a custom class override the conflicting minimum height", () => {
        render(<Textarea aria-label="Tall" className="min-h-[300px]" />);

        const textarea = screen.getByRole("textbox", { name: "Tall" });
        expect(textarea).toHaveClass("min-h-[300px]");
        expect(textarea).not.toHaveClass("min-h-[100px]");
    });

    test("forwards a ref to the underlying textarea", () => {
        let captured: HTMLTextAreaElement | null = null;
        render(<Textarea aria-label="With ref" ref={(node) => {
                captured = node;
            }} />);

        expect(captured).not.toBeNull();
        expect((captured as unknown as HTMLTextAreaElement).tagName).toBe("TEXTAREA");
    });

    test("submits its value with the surrounding form", async () => {
        let submitted: string | null = null;
        render(
            <form
                onSubmit={(event) => {
                    event.preventDefault();
                    submitted = new FormData(event.currentTarget).get("about") as string;
                }}
            >
                <Textarea aria-label="About" name="about" defaultValue="hello world" />
                <button type="submit">Save</button>
            </form>,
        );

        await userEvent.click(screen.getByRole("button", { name: "Save" }));

        expect(submitted).toBe("hello world");
    });
});
