import { describe, expect, test } from "bun:test";
import type { EventDisplay } from "@/models/models";
import { EVENT_JOIN_OPEN_MINUTES, getEventJoinState } from "./event-join-state";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const START = new Date("2026-06-15T18:00:00.000Z");
const at = (offsetMs: number) => new Date(START.getTime() + offsetMs);

const event = (overrides: Record<string, unknown> = {}) =>
    ({
        isVirtual: true,
        virtualUrl: "https://meet.example/room",
        startAt: START,
        endAt: new Date(START.getTime() + HOUR),
        stage: "open",
        ...overrides,
    }) as unknown as EventDisplay;

const JOIN = { href: "https://meet.example/room", isMissingLink: false, label: "Join" };

describe("EVENT_JOIN_OPEN_MINUTES", () => {
    test("opens joining 15 minutes before the start", () => {
        expect(EVENT_JOIN_OPEN_MINUTES).toBe(15);
    });
});

describe("getEventJoinState", () => {
    describe("events that are not virtual", () => {
        test("have no join state", () => {
            expect(getEventJoinState(event({ isVirtual: false }), { now: START })).toBeNull();
            expect(getEventJoinState(event({ isVirtual: undefined }), { now: START })).toBeNull();
        });

        test("have no join state even when a link is present and the viewer can manage links", () => {
            expect(getEventJoinState(event({ isVirtual: false }), { canManageMissingLink: true })).toBeNull();
        });
    });

    describe("without a join link", () => {
        test.each([["missing", undefined], ["empty", ""], ["blank", "   \n\t"]])("hides the button when the link is %s", (_label, virtualUrl) => {
            expect(getEventJoinState(event({ virtualUrl }), { now: START })).toBeNull();
        });

        test("prompts managers to add a link", () => {
            expect(getEventJoinState(event({ virtualUrl: "" }), { canManageMissingLink: true })).toEqual({
                isEnabled: false,
                isMissingLink: true,
                label: "Missing link",
                title: "Add a join link to this online event.",
            });
        });

        test("uses a custom label for the missing-link prompt", () => {
            expect(getEventJoinState(event({ virtualUrl: "" }), { canManageMissingLink: true, missingLinkLabel: "Add link" })?.label).toBe(
                "Add link",
            );
        });

        test("shows the prompt regardless of timing or cancellation", () => {
            const state = getEventJoinState(event({ virtualUrl: "", stage: "cancelled" }), { canManageMissingLink: true, now: at(-5 * HOUR) });

            expect(state).toMatchObject({ isMissingLink: true, isEnabled: false });
        });
    });

    describe("cancelled events", () => {
        test("disable joining and say why, even during the event", () => {
            expect(getEventJoinState(event({ stage: "cancelled" }), { now: at(10 * MINUTE) })).toEqual({
                ...JOIN,
                isEnabled: false,
                title: "This event has been cancelled.",
            });
        });
    });

    describe("events without a usable start time", () => {
        test.each([["missing", undefined], ["null", null], ["invalid", "not a date"]])("allow joining when the start is %s", (_label, startAt) => {
            expect(getEventJoinState(event({ startAt }), { now: at(-100 * HOUR) })).toEqual({
                ...JOIN,
                isEnabled: true,
                title: "Join event",
            });
        });
    });

    describe("timing", () => {
        const stateAt = (offsetMs: number, overrides: Record<string, unknown> = {}) =>
            getEventJoinState(event(overrides), { now: at(offsetMs) })!;

        test("is not available well before the start", () => {
            expect(stateAt(-2 * HOUR)).toEqual({ ...JOIN, isEnabled: false, title: "Available 15 minutes before start" });
        });

        test("is not available one millisecond before the joining window opens", () => {
            expect(stateAt(-15 * MINUTE - 1).isEnabled).toBe(false);
        });

        test("opens exactly 15 minutes before the start", () => {
            expect(stateAt(-15 * MINUTE)).toEqual({ ...JOIN, isEnabled: true, title: "Join event" });
        });

        test("is available while the event runs", () => {
            expect(stateAt(0).isEnabled).toBe(true);
            expect(stateAt(30 * MINUTE).isEnabled).toBe(true);
        });

        test("is still available at the exact end", () => {
            expect(stateAt(HOUR).isEnabled).toBe(true);
        });

        test("closes one millisecond after the end", () => {
            expect(stateAt(HOUR + 1)).toEqual({ ...JOIN, isEnabled: false, title: "This event has ended." });
        });

        test("allows joining for two hours after the start when there is no end time", () => {
            expect(stateAt(2 * HOUR, { endAt: undefined }).isEnabled).toBe(true);
            expect(stateAt(2 * HOUR + 1, { endAt: undefined }).isEnabled).toBe(false);
        });

        test("falls back to the two hour window when the end time is invalid", () => {
            expect(stateAt(2 * HOUR, { endAt: "garbage" }).isEnabled).toBe(true);
            expect(stateAt(2 * HOUR + 1, { endAt: "garbage" }).isEnabled).toBe(false);
        });

        test("uses an explicit end time even when it is shorter than the default window", () => {
            expect(stateAt(30 * MINUTE + 1, { endAt: at(30 * MINUTE) }).isEnabled).toBe(false);
        });

        test("accepts dates supplied as ISO strings", () => {
            const isoEvent = { startAt: START.toISOString(), endAt: at(HOUR).toISOString() };

            expect(stateAt(-20 * MINUTE, isoEvent).isEnabled).toBe(false);
            expect(stateAt(0, isoEvent).isEnabled).toBe(true);
            expect(stateAt(HOUR + 1, isoEvent).isEnabled).toBe(false);
        });
    });

    describe("the link", () => {
        test("is trimmed", () => {
            expect(getEventJoinState(event({ virtualUrl: "  https://meet.example/room  " }), { now: START })?.href).toBe("https://meet.example/room");
        });

        test("is not validated", () => {
            expect(getEventJoinState(event({ virtualUrl: "javascript:alert(1)" }), { now: START })?.href).toBe("javascript:alert(1)");
        });
    });

    test("defaults to the current time", () => {
        const farFuture = event({ startAt: new Date(Date.now() + 365 * 24 * HOUR), endAt: undefined });

        expect(getEventJoinState(farFuture)?.isEnabled).toBe(false);
        expect(getEventJoinState(farFuture)?.title).toBe("Available 15 minutes before start");
    });
});
