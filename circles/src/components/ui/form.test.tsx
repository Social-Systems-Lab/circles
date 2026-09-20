import { describe, expect, test } from "bun:test";
import { render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm } from "react-hook-form";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage, useFormField } from "./form";

type Values = {
    username: string;
};

type ProfileFormProps = {
    onValid?: (values: Values) => void;
    withDescription?: boolean;
    required?: boolean;
    messageChildren?: React.ReactNode;
};

const ProfileForm = ({ onValid, withDescription = true, required = true, messageChildren }: ProfileFormProps) => {
    const form = useForm<Values>({ defaultValues: { username: "" } });

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit((values) => onValid?.(values))}>
                <FormField
                    control={form.control}
                    name="username"
                    rules={required ? { required: "Username is required" } : undefined}
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Username</FormLabel>
                            <FormControl>
                                <input {...field} />
                            </FormControl>
                            {withDescription ? <FormDescription>Shown on your profile.</FormDescription> : null}
                            <FormMessage>{messageChildren}</FormMessage>
                        </FormItem>
                    )}
                />
                <button type="submit">Save</button>
            </form>
        </Form>
    );
};

describe("Form", () => {
    test("links the label to the control it describes", () => {
        render(<ProfileForm />);

        const input = screen.getByLabelText("Username");
        expect(input.tagName).toBe("INPUT");
        expect(screen.getByText("Username")).toHaveAttribute("for", input.id);
        expect(input.id).toMatch(/-form-item$/);
    });

    test("points the control at its description while the field is valid", () => {
        render(<ProfileForm />);

        const input = screen.getByLabelText("Username");
        const description = screen.getByText("Shown on your profile.");
        expect(input).toHaveAttribute("aria-describedby", description.id);
        expect(input).toHaveAttribute("aria-invalid", "false");
    });

    test("derives the description and message ids from the same form item id", () => {
        render(<ProfileForm />);

        const input = screen.getByLabelText("Username");
        const itemId = input.id.replace(/-form-item$/, "");
        expect(screen.getByText("Shown on your profile.")).toHaveAttribute("id", `${itemId}-form-item-description`);
    });

    test("shows the validation message and marks the control invalid after an empty submit", async () => {
        render(<ProfileForm />);

        await userEvent.click(screen.getByRole("button", { name: "Save" }));

        const message = screen.getByText("Username is required");
        const input = screen.getByLabelText("Username");
        expect(input).toHaveAttribute("aria-invalid", "true");
        expect(input.getAttribute("aria-describedby")?.split(" ")).toContain(message.id);
        expect(message.id).toMatch(/-form-item-message$/);
    });

    test("turns the label red while the field has an error", async () => {
        render(<ProfileForm />);

        expect(screen.getByText("Username")).not.toHaveClass("text-destructive");

        await userEvent.click(screen.getByRole("button", { name: "Save" }));

        expect(screen.getByText("Username")).toHaveClass("text-destructive");
    });

    test("does not call the submit handler while the values are invalid", async () => {
        const submitted: Values[] = [];
        render(<ProfileForm onValid={(values) => submitted.push(values)} />);

        await userEvent.click(screen.getByRole("button", { name: "Save" }));

        expect(submitted).toEqual([]);
    });

    test("calls the submit handler with the entered values once they are valid", async () => {
        const submitted: Values[] = [];
        render(<ProfileForm onValid={(values) => submitted.push(values)} />);

        await userEvent.type(screen.getByLabelText("Username"), "ada");
        await userEvent.click(screen.getByRole("button", { name: "Save" }));

        expect(submitted).toEqual([{ username: "ada" }]);
    });

    test("clears the error and the invalid state once the field is corrected", async () => {
        render(<ProfileForm />);

        await userEvent.click(screen.getByRole("button", { name: "Save" }));
        expect(screen.getByText("Username is required")).toBeInTheDocument();

        await userEvent.type(screen.getByLabelText("Username"), "ada");

        expect(screen.queryByText("Username is required")).toBeNull();
        expect(screen.getByLabelText("Username")).toHaveAttribute("aria-invalid", "false");
    });

    test("renders no message element while the field is valid and has no children", () => {
        const { container } = render(<ProfileForm />);

        expect(container.querySelector("[id$='-form-item-message']")).toBeNull();
    });

    test("renders the message children when there is no error", () => {
        render(<ProfileForm messageChildren="Letters and numbers only" />);

        expect(screen.getByText("Letters and numbers only")).toHaveClass("text-destructive");
    });

    test("replaces the message children with the validation error", async () => {
        render(<ProfileForm messageChildren="Letters and numbers only" />);

        await userEvent.click(screen.getByRole("button", { name: "Save" }));

        expect(screen.getByText("Username is required")).toBeInTheDocument();
        expect(screen.queryByText("Letters and numbers only")).toBeNull();
    });

    test("still points aria-describedby at a description id when no FormDescription is rendered", () => {
        render(<ProfileForm withDescription={false} />);

        const input = screen.getByLabelText("Username");
        const describedBy = input.getAttribute("aria-describedby") ?? "";
        expect(describedBy).toMatch(/-form-item-description$/);
        expect(document.getElementById(describedBy)).toBeNull();
    });

    test("keeps each field's ids and messages separate", async () => {
        const TwoFieldForm = () => {
            const form = useForm<{ name: string; email: string }>({ defaultValues: { name: "", email: "" } });
            return (
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(() => {})}>
                        <FormField
                            control={form.control}
                            name="name"
                            rules={{ required: "Name is required" }}
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Name</FormLabel>
                                    <FormControl>
                                        <input {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="email"
                            rules={{ required: "Email is required" }}
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Email</FormLabel>
                                    <FormControl>
                                        <input {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <button type="submit">Save</button>
                    </form>
                </Form>
            );
        };
        render(<TwoFieldForm />);

        await userEvent.click(screen.getByRole("button", { name: "Save" }));
        expect(screen.getByText("Name is required")).toBeInTheDocument();
        expect(screen.getByText("Email is required")).toBeInTheDocument();

        const [name, email] = screen.getAllByRole("textbox");
        expect(name.getAttribute("aria-describedby")).not.toBe(email.getAttribute("aria-describedby"));

        await userEvent.type(name, "Ada");

        expect(screen.queryByText("Name is required")).toBeNull();
        expect(screen.getByText("Email is required")).toBeInTheDocument();
        expect(name).toHaveAttribute("aria-invalid", "false");
        expect(email).toHaveAttribute("aria-invalid", "true");
    });

    test("passes the control wiring on to whatever element FormControl wraps", () => {
        const BioForm = () => {
            const form = useForm<{ bio: string }>({ defaultValues: { bio: "" } });
            return (
                <Form {...form}>
                    <FormField
                        control={form.control}
                        name="bio"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Bio</FormLabel>
                                <FormControl>
                                    <textarea {...field} />
                                </FormControl>
                            </FormItem>
                        )}
                    />
                </Form>
            );
        };
        render(<BioForm />);

        const textarea = screen.getByLabelText("Bio");
        expect(textarea.tagName).toBe("TEXTAREA");
        expect(textarea).toHaveAttribute("aria-invalid", "false");
        expect(textarea.id).toMatch(/-form-item$/);
    });

    test("supports nested field names", async () => {
        const submitted: unknown[] = [];
        const NestedForm = () => {
            const form = useForm<{ profile: { name: string } }>({ defaultValues: { profile: { name: "" } } });
            return (
                <Form {...form}>
                    <form onSubmit={form.handleSubmit((values) => submitted.push(values))}>
                        <FormField
                            control={form.control}
                            name="profile.name"
                            rules={{ required: "Name is required" }}
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Name</FormLabel>
                                    <FormControl>
                                        <input {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <button type="submit">Save</button>
                    </form>
                </Form>
            );
        };
        render(<NestedForm />);

        await userEvent.click(screen.getByRole("button", { name: "Save" }));
        expect(screen.getByText("Name is required")).toBeInTheDocument();

        await userEvent.type(screen.getByLabelText("Name"), "Ada");
        await userEvent.click(screen.getByRole("button", { name: "Save" }));

        expect(submitted).toEqual([{ profile: { name: "Ada" } }]);
    });

    test("renders the literal text undefined when an error carries no message", async () => {
        const ManualErrorForm = () => {
            const form = useForm<Values>({ defaultValues: { username: "" } });
            return (
                <Form {...form}>
                    <FormField
                        control={form.control}
                        name="username"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Username</FormLabel>
                                <FormControl>
                                    <input {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <button type="button" onClick={() => form.setError("username", { type: "manual" })}>
                        Fail
                    </button>
                </Form>
            );
        };
        const { container } = render(<ManualErrorForm />);

        await userEvent.click(screen.getByRole("button", { name: "Fail" }));

        expect(container.querySelector("[id$='-form-item-message']")).toHaveTextContent("undefined");
        expect(screen.getByLabelText("Username")).toHaveAttribute("aria-invalid", "true");
    });

    test("merges custom classes on the item, the label, the description and the message", async () => {
        const StyledForm = () => {
            const form = useForm<Values>({ defaultValues: { username: "" } });
            return (
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(() => {})}>
                        <FormField
                            control={form.control}
                            name="username"
                            rules={{ required: "Username is required" }}
                            render={({ field }) => (
                                <FormItem className="item-class">
                                    <FormLabel className="label-class">Username</FormLabel>
                                    <FormControl>
                                        <input {...field} />
                                    </FormControl>
                                    <FormDescription className="description-class">Shown publicly.</FormDescription>
                                    <FormMessage className="message-class" />
                                </FormItem>
                            )}
                        />
                        <button type="submit">Save</button>
                    </form>
                </Form>
            );
        };
        const { container } = render(<StyledForm />);

        expect(container.querySelector(".item-class")).toHaveClass("space-y-2");
        expect(screen.getByText("Username")).toHaveClass("label-class", "text-sm");
        expect(screen.getByText("Shown publicly.")).toHaveClass("description-class", "text-muted-foreground");

        await userEvent.click(screen.getByRole("button", { name: "Save" }));

        expect(screen.getByText("Username is required")).toHaveClass("message-class", "text-destructive");
    });
});

describe("useFormField", () => {
    test("throws when it is used outside of a Form provider", () => {
        expect(() => renderHook(() => useFormField())).toThrow();
    });

    test("returns ids built from an undefined field name when used outside a FormField", () => {
        let field: ReturnType<typeof useFormField> | null = null;
        const Probe = () => {
            field = useFormField();
            return null;
        };
        const Wrapper = () => {
            const form = useForm();
            return (
                <Form {...form}>
                    <Probe />
                </Form>
            );
        };
        render(<Wrapper />);

        expect(field).not.toBeNull();
        expect(field!.name).toBeUndefined();
        expect(field!.formItemId).toBe("undefined-form-item");
        expect(field!.error).toBeUndefined();
    });

    test("exposes the field name, the generated ids and the error state inside a FormField", async () => {
        let field: ReturnType<typeof useFormField> | null = null;
        const Probe = () => {
            field = useFormField();
            return null;
        };
        const ProbeForm = () => {
            const form = useForm<Values>({ defaultValues: { username: "" } });
            return (
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(() => {})}>
                        <FormField
                            control={form.control}
                            name="username"
                            rules={{ required: "Username is required" }}
                            render={({ field: controlled }) => (
                                <FormItem>
                                    <FormLabel>Username</FormLabel>
                                    <FormControl>
                                        <input {...controlled} />
                                    </FormControl>
                                    <Probe />
                                </FormItem>
                            )}
                        />
                        <button type="submit">Save</button>
                    </form>
                </Form>
            );
        };
        render(<ProbeForm />);

        expect(field!.name).toBe("username");
        expect(field!.formItemId).toBe(`${field!.id}-form-item`);
        expect(field!.formDescriptionId).toBe(`${field!.id}-form-item-description`);
        expect(field!.formMessageId).toBe(`${field!.id}-form-item-message`);
        expect(field!.error).toBeUndefined();

        await userEvent.click(screen.getByRole("button", { name: "Save" }));

        expect(field!.error?.message).toBe("Username is required");
        expect(field!.invalid).toBe(true);
    });
});
