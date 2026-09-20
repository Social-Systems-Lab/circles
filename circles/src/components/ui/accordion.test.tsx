import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "./accordion";

const renderAccordion = (props: Partial<React.ComponentProps<typeof Accordion>> = {}) =>
    render(
        <Accordion type="single" collapsible {...(props as React.ComponentProps<typeof Accordion>)}>
            <AccordionItem value="first">
                <AccordionTrigger>First question</AccordionTrigger>
                <AccordionContent>First answer</AccordionContent>
            </AccordionItem>
            <AccordionItem value="second">
                <AccordionTrigger>Second question</AccordionTrigger>
                <AccordionContent>Second answer</AccordionContent>
            </AccordionItem>
        </Accordion>,
    );

describe("Accordion", () => {
    test("renders every trigger and keeps all panels collapsed initially", () => {
        renderAccordion();

        expect(screen.getByRole("button", { name: "First question" })).toHaveAttribute("aria-expanded", "false");
        expect(screen.getByRole("button", { name: "Second question" })).toHaveAttribute("aria-expanded", "false");
        expect(screen.queryByText("First answer")).toBeNull();
    });

    test("reveals the panel content when its trigger is clicked", async () => {
        renderAccordion();

        await userEvent.click(screen.getByRole("button", { name: "First question" }));

        expect(screen.getByText("First answer")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "First question" })).toHaveAttribute("aria-expanded", "true");
    });

    test("collapses an open panel again when collapsible is enabled", async () => {
        renderAccordion();
        const trigger = screen.getByRole("button", { name: "First question" });

        await userEvent.click(trigger);
        await userEvent.click(trigger);

        expect(trigger).toHaveAttribute("aria-expanded", "false");
    });

    test("keeps only one panel open at a time in single mode", async () => {
        renderAccordion();

        await userEvent.click(screen.getByRole("button", { name: "First question" }));
        await userEvent.click(screen.getByRole("button", { name: "Second question" }));

        expect(screen.getByRole("button", { name: "First question" })).toHaveAttribute("aria-expanded", "false");
        expect(screen.getByRole("button", { name: "Second question" })).toHaveAttribute("aria-expanded", "true");
    });

    test("allows several panels open at once in multiple mode", async () => {
        render(
            <Accordion type="multiple">
                <AccordionItem value="first">
                    <AccordionTrigger>First question</AccordionTrigger>
                    <AccordionContent>First answer</AccordionContent>
                </AccordionItem>
                <AccordionItem value="second">
                    <AccordionTrigger>Second question</AccordionTrigger>
                    <AccordionContent>Second answer</AccordionContent>
                </AccordionItem>
            </Accordion>,
        );

        await userEvent.click(screen.getByRole("button", { name: "First question" }));
        await userEvent.click(screen.getByRole("button", { name: "Second question" }));

        expect(screen.getByRole("button", { name: "First question" })).toHaveAttribute("aria-expanded", "true");
        expect(screen.getByRole("button", { name: "Second question" })).toHaveAttribute("aria-expanded", "true");
    });

    test("opens the item given by defaultValue", () => {
        renderAccordion({ defaultValue: "second" });

        expect(screen.getByRole("button", { name: "Second question" })).toHaveAttribute("aria-expanded", "true");
        expect(screen.getByText("Second answer")).toBeInTheDocument();
    });

    test("reports value changes to onValueChange", async () => {
        const changes: string[] = [];
        renderAccordion({ onValueChange: (value) => changes.push(value as string) });

        await userEvent.click(screen.getByRole("button", { name: "Second question" }));

        expect(changes).toEqual(["second"]);
    });

    test("does not open a disabled item", async () => {
        render(
            <Accordion type="single" collapsible>
                <AccordionItem value="first" disabled>
                    <AccordionTrigger>Disabled question</AccordionTrigger>
                    <AccordionContent>Hidden answer</AccordionContent>
                </AccordionItem>
            </Accordion>,
        );

        const trigger = screen.getByRole("button", { name: "Disabled question" });
        await userEvent.click(trigger, { pointerEventsCheck: 0 });

        expect(trigger).toHaveAttribute("aria-expanded", "false");
        expect(screen.queryByText("Hidden answer")).toBeNull();
    });

    test("moves focus between triggers with the arrow keys", async () => {
        renderAccordion();
        const first = screen.getByRole("button", { name: "First question" });

        first.focus();
        await userEvent.keyboard("{ArrowDown}");

        expect(screen.getByRole("button", { name: "Second question" })).toHaveFocus();
    });

    test("toggles a panel with the keyboard", async () => {
        renderAccordion();
        const trigger = screen.getByRole("button", { name: "First question" });

        trigger.focus();
        await userEvent.keyboard("{Enter}");

        expect(trigger).toHaveAttribute("aria-expanded", "true");
    });

    test("links each trigger to the panel it controls", async () => {
        renderAccordion();
        const trigger = screen.getByRole("button", { name: "First question" });

        await userEvent.click(trigger);

        const panelId = trigger.getAttribute("aria-controls");
        const panel = document.getElementById(panelId ?? "");
        expect(panel).not.toBeNull();
        expect(panel).toHaveTextContent("First answer");
    });

    test("applies custom classes to item, trigger and content", async () => {
        render(
            <Accordion type="single" collapsible defaultValue="first">
                <AccordionItem value="first" className="item-class">
                    <AccordionTrigger className="trigger-class">Question</AccordionTrigger>
                    <AccordionContent className="content-class">Answer</AccordionContent>
                </AccordionItem>
            </Accordion>,
        );

        expect(screen.getByRole("button", { name: "Question" })).toHaveClass("trigger-class");
        expect(screen.getByText("Answer")).toHaveClass("content-class");
        expect(document.querySelector(".item-class")).toHaveClass("border-b");
    });

    test("marks the open item with a data-state attribute for styling", async () => {
        renderAccordion();
        const trigger = screen.getByRole("button", { name: "First question" });

        expect(trigger).toHaveAttribute("data-state", "closed");
        await userEvent.click(trigger);
        expect(trigger).toHaveAttribute("data-state", "open");
    });
});
