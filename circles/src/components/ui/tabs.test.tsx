import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { focusElement } from "@/test/react-act";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";

const renderTabs = (props: Partial<React.ComponentProps<typeof Tabs>> = {}) =>
    render(
        <Tabs defaultValue="feed" {...props}>
            <TabsList>
                <TabsTrigger value="feed">Feed</TabsTrigger>
                <TabsTrigger value="members">Members</TabsTrigger>
                <TabsTrigger value="settings" disabled>
                    Settings
                </TabsTrigger>
            </TabsList>
            <TabsContent value="feed">Feed panel</TabsContent>
            <TabsContent value="members">Members panel</TabsContent>
            <TabsContent value="settings">Settings panel</TabsContent>
        </Tabs>,
    );

describe("Tabs", () => {
    test("renders one tab per trigger inside a tablist", () => {
        renderTabs();

        expect(screen.getByRole("tablist")).toBeInTheDocument();
        expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Feed", "Members", "Settings"]);
    });

    test("selects the tab named by defaultValue and renders only its panel", () => {
        renderTabs();

        expect(screen.getByRole("tab", { name: "Feed" })).toHaveAttribute("aria-selected", "true");
        expect(screen.getByRole("tab", { name: "Members" })).toHaveAttribute("aria-selected", "false");
        expect(screen.getByText("Feed panel")).toBeInTheDocument();
        expect(screen.queryByText("Members panel")).toBeNull();
    });

    test("switches the visible panel when another tab is clicked", async () => {
        renderTabs();

        await userEvent.click(screen.getByRole("tab", { name: "Members" }));

        expect(screen.getByRole("tab", { name: "Members" })).toHaveAttribute("aria-selected", "true");
        expect(screen.getByRole("tab", { name: "Feed" })).toHaveAttribute("aria-selected", "false");
        expect(screen.getByText("Members panel")).toBeInTheDocument();
        expect(screen.queryByText("Feed panel")).toBeNull();
    });

    test("reports the newly selected value to onValueChange", async () => {
        const changes: string[] = [];
        renderTabs({ onValueChange: (value) => changes.push(value) });

        await userEvent.click(screen.getByRole("tab", { name: "Members" }));

        expect(changes).toEqual(["members"]);
    });

    test("keeps the panel of a controlled value even after a click, while still reporting the request", async () => {
        const changes: string[] = [];
        render(
            <Tabs value="feed" onValueChange={(value) => changes.push(value)}>
                <TabsList>
                    <TabsTrigger value="feed">Feed</TabsTrigger>
                    <TabsTrigger value="members">Members</TabsTrigger>
                </TabsList>
                <TabsContent value="feed">Feed panel</TabsContent>
                <TabsContent value="members">Members panel</TabsContent>
            </Tabs>,
        );

        await userEvent.click(screen.getByRole("tab", { name: "Members" }));

        expect(screen.getByRole("tab", { name: "Feed" })).toHaveAttribute("aria-selected", "true");
        expect(screen.getByText("Feed panel")).toBeInTheDocument();
        expect(changes).toContain("members");
    });

    test("links every tab to the panel it controls", async () => {
        renderTabs();
        const tab = screen.getByRole("tab", { name: "Feed" });

        const panel = document.getElementById(tab.getAttribute("aria-controls") ?? "");

        expect(panel).toHaveTextContent("Feed panel");
        expect(panel).toHaveAttribute("aria-labelledby", tab.id);
        expect(panel).toHaveAttribute("role", "tabpanel");
    });

    test("activates the next tab with the arrow keys", async () => {
        renderTabs();
        await focusElement(screen.getByRole("tab", { name: "Feed" }));

        await userEvent.keyboard("{ArrowRight}");

        const members = screen.getByRole("tab", { name: "Members" });
        expect(members).toHaveFocus();
        expect(members).toHaveAttribute("aria-selected", "true");
        expect(screen.getByText("Members panel")).toBeInTheDocument();
    });

    test("skips a disabled tab and wraps around when arrowing past the end", async () => {
        renderTabs();
        await focusElement(screen.getByRole("tab", { name: "Members" }));

        await userEvent.keyboard("{ArrowRight}");

        expect(screen.getByRole("tab", { name: "Settings" })).toHaveAttribute("aria-selected", "false");
        expect(screen.getByRole("tab", { name: "Feed" })).toHaveAttribute("aria-selected", "true");
    });

    test("does not activate a disabled tab when it is clicked", async () => {
        renderTabs();

        await userEvent.click(screen.getByRole("tab", { name: "Settings" }), { pointerEventsCheck: 0 });

        expect(screen.getByRole("tab", { name: "Settings" })).toHaveAttribute("aria-selected", "false");
        expect(screen.queryByText("Settings panel")).toBeNull();
        expect(screen.getByText("Feed panel")).toBeInTheDocument();
    });

    test("only moves focus with the arrow keys in manual activation mode", async () => {
        renderTabs({ activationMode: "manual" });
        await focusElement(screen.getByRole("tab", { name: "Feed" }));

        await userEvent.keyboard("{ArrowRight}");

        expect(screen.getByRole("tab", { name: "Members" })).toHaveFocus();
        expect(screen.getByRole("tab", { name: "Feed" })).toHaveAttribute("aria-selected", "true");

        await userEvent.keyboard("{Enter}");

        expect(screen.getByRole("tab", { name: "Members" })).toHaveAttribute("aria-selected", "true");
        expect(screen.getByText("Members panel")).toBeInTheDocument();
    });

    test("follows the vertical orientation on the tablist and its arrow keys", async () => {
        renderTabs({ orientation: "vertical" });

        expect(screen.getByRole("tablist")).toHaveAttribute("aria-orientation", "vertical");

        await focusElement(screen.getByRole("tab", { name: "Feed" }));
        await userEvent.keyboard("{ArrowDown}");

        expect(screen.getByRole("tab", { name: "Members" })).toHaveFocus();
    });

    test("keeps an inactive panel mounted when forceMount is set", () => {
        render(
            <Tabs defaultValue="feed">
                <TabsList>
                    <TabsTrigger value="feed">Feed</TabsTrigger>
                    <TabsTrigger value="members">Members</TabsTrigger>
                </TabsList>
                <TabsContent value="feed">Feed panel</TabsContent>
                <TabsContent value="members" forceMount>
                    Members panel
                </TabsContent>
            </Tabs>,
        );

        expect(screen.getByText("Members panel")).toBeInTheDocument();
        expect(screen.getByText("Members panel")).toHaveAttribute("data-state", "inactive");
    });

    test("marks the active trigger and panel with a data-state attribute", async () => {
        renderTabs();
        const feed = screen.getByRole("tab", { name: "Feed" });

        expect(feed).toHaveAttribute("data-state", "active");
        expect(screen.getByText("Feed panel")).toHaveAttribute("data-state", "active");

        await userEvent.click(screen.getByRole("tab", { name: "Members" }));

        expect(feed).toHaveAttribute("data-state", "inactive");
    });

    test("merges custom classes on the list, the trigger and the content", () => {
        render(
            <Tabs defaultValue="feed">
                <TabsList className="list-class">
                    <TabsTrigger value="feed" className="trigger-class">
                        Feed
                    </TabsTrigger>
                </TabsList>
                <TabsContent value="feed" className="content-class">
                    Feed panel
                </TabsContent>
            </Tabs>,
        );

        expect(screen.getByRole("tablist")).toHaveClass("list-class", "inline-flex");
        expect(screen.getByRole("tab")).toHaveClass("trigger-class", "whitespace-nowrap");
        expect(screen.getByRole("tabpanel")).toHaveClass("content-class", "mt-2");
    });

    test("renders a single tab without any sibling to arrow to", async () => {
        render(
            <Tabs defaultValue="only">
                <TabsList>
                    <TabsTrigger value="only">Only</TabsTrigger>
                </TabsList>
                <TabsContent value="only">Only panel</TabsContent>
            </Tabs>,
        );
        const only = screen.getByRole("tab", { name: "Only" });
        await focusElement(only);

        await userEvent.keyboard("{ArrowRight}");

        expect(only).toHaveFocus();
        expect(only).toHaveAttribute("aria-selected", "true");
    });

    test("renders no panel when no tab matches the current value", () => {
        render(
            <Tabs defaultValue="missing">
                <TabsList>
                    <TabsTrigger value="feed">Feed</TabsTrigger>
                </TabsList>
                <TabsContent value="feed">Feed panel</TabsContent>
            </Tabs>,
        );

        expect(screen.queryByRole("tabpanel")).toBeNull();
        expect(screen.getByRole("tab", { name: "Feed" })).toHaveAttribute("aria-selected", "false");
    });
});
