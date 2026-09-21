import { describe, expect, test } from "bun:test";
import type { Circle, Task, TaskDisplay, TaskParticipant } from "@/models/models";
import {
    SHIFT_DURATION_OPTIONS,
    getShiftConfirmedCount,
    getShiftConfirmedParticipants,
    getShiftConfirmedSummary,
    getShiftDisplayStatus,
    getShiftEndAt,
    getShiftPendingCount,
    getShiftPendingParticipants,
    getShiftPendingSummary,
    getShiftSignedUpCount,
    getShiftSignupSummary,
    getShiftStartAt,
    isShiftTask,
} from "./shift-task-utils";

const participant = (userDid: string, verified = false) =>
    ({ userDid, ...(verified ? { verifiedAt: new Date("2026-06-15T12:00:00.000Z") } : {}) }) as unknown as TaskParticipant;

// Dates are built with local-time components because shift start times are interpreted in local time.
const shift = (overrides: Record<string, unknown> = {}) =>
    ({
        taskType: "shift",
        targetDate: new Date(2026, 5, 15),
        shiftStartTime: "09:30",
        shiftDurationMinutes: 60,
        stage: "open",
        ...overrides,
    }) as unknown as Task;

const local = (hours: number, minutes = 0) => new Date(2026, 5, 15, hours, minutes, 0, 0);

describe("SHIFT_DURATION_OPTIONS", () => {
    test("offers 30 minute to 4 hour shifts", () => {
        expect(SHIFT_DURATION_OPTIONS.map((option) => option.value)).toEqual([30, 60, 120, 180, 240]);
        expect(SHIFT_DURATION_OPTIONS.map((option) => option.label)).toEqual(["30 minutes", "1 hour", "2 hours", "3 hours", "4 hours"]);
    });
});

describe("isShiftTask", () => {
    test("is true only for shift tasks", () => {
        expect(isShiftTask({ taskType: "shift" })).toBe(true);
        expect(isShiftTask({ taskType: "outcome" })).toBe(false);
    });

    test("treats a task without a type as an outcome task", () => {
        expect(isShiftTask({})).toBe(false);
        expect(isShiftTask({ taskType: undefined })).toBe(false);
    });
});

describe("getShiftStartAt", () => {
    test("combines the target date with the start time in local time", () => {
        expect(getShiftStartAt(shift())).toEqual(local(9, 30));
    });

    test("supports single digit and 24 hour times", () => {
        expect(getShiftStartAt(shift({ shiftStartTime: "7:05" }))).toEqual(local(7, 5));
        expect(getShiftStartAt(shift({ shiftStartTime: "23:59" }))).toEqual(local(23, 59));
        expect(getShiftStartAt(shift({ shiftStartTime: "00:00" }))).toEqual(local(0, 0));
    });

    test("replaces any time already present on the target date and zeroes seconds", () => {
        const start = getShiftStartAt(shift({ targetDate: new Date(2026, 5, 15, 17, 45, 33, 500) }))!;

        expect(start).toEqual(local(9, 30));
        expect(start.getSeconds()).toBe(0);
        expect(start.getMilliseconds()).toBe(0);
    });

    test("does not mutate the target date", () => {
        const targetDate = new Date(2026, 5, 15, 17, 45);

        getShiftStartAt(shift({ targetDate }));

        expect(targetDate).toEqual(new Date(2026, 5, 15, 17, 45));
    });

    test("accepts a target date given as a string", () => {
        expect(getShiftStartAt(shift({ targetDate: new Date(2026, 5, 15).toISOString() }))).toEqual(local(9, 30));
    });

    test.each([
        ["target date", { targetDate: undefined }],
        ["start time", { shiftStartTime: undefined }],
        ["empty start time", { shiftStartTime: "" }],
    ])("is null without a %s", (_label, overrides) => {
        expect(getShiftStartAt(shift(overrides))).toBeNull();
    });

    test.each(["nine", "ab:cd", "09", "09:xx", "xx:30"])("is null for the start time %p", (shiftStartTime) => {
        expect(getShiftStartAt(shift({ shiftStartTime }))).toBeNull();
    });

    // `Number("")` is 0, so an empty hour or minute part is read as zero rather than rejected.
    test("reads an empty hour or minute part as zero", () => {
        expect(getShiftStartAt(shift({ shiftStartTime: ":" }))).toEqual(local(0, 0));
        expect(getShiftStartAt(shift({ shiftStartTime: "09:" }))).toEqual(local(9, 0));
        expect(getShiftStartAt(shift({ shiftStartTime: ":30" }))).toEqual(local(0, 30));
    });

    test("is null for an invalid target date", () => {
        expect(getShiftStartAt(shift({ targetDate: "not a date" }))).toBeNull();
    });

    test("does not range-check the time and lets the date roll over", () => {
        expect(getShiftStartAt(shift({ shiftStartTime: "25:00" }))).toEqual(new Date(2026, 5, 16, 1, 0));
    });
});

describe("getShiftEndAt", () => {
    test("adds the duration to the start", () => {
        expect(getShiftEndAt(shift({ shiftDurationMinutes: 90 }))).toEqual(local(11, 0));
    });

    test("can cross midnight", () => {
        expect(getShiftEndAt(shift({ shiftStartTime: "23:30", shiftDurationMinutes: 60 }))).toEqual(new Date(2026, 5, 16, 0, 30));
    });

    test.each([["undefined", undefined], ["zero", 0]])("is null when the duration is %s", (_label, shiftDurationMinutes) => {
        expect(getShiftEndAt(shift({ shiftDurationMinutes }))).toBeNull();
    });

    test("is null without a start", () => {
        expect(getShiftEndAt(shift({ shiftStartTime: undefined }))).toBeNull();
    });
});

describe("getShiftDisplayStatus", () => {
    const status = (now: Date, overrides: Record<string, unknown> = {}) => getShiftDisplayStatus(shift(overrides), now);

    test("a shift in review is in review, whatever the time", () => {
        expect(status(local(10), { stage: "review" })).toBe("review");
        expect(status(local(3), { stage: "review" })).toBe("review");
    });

    test("a resolved shift is completed, whatever the time", () => {
        expect(status(local(3), { stage: "resolved" })).toBe("completed");
    });

    test("review takes precedence over resolved only by stage, not by combining", () => {
        expect(status(local(10), { stage: "review" })).not.toBe("completed");
    });

    test("is upcoming before the start", () => {
        expect(status(local(9, 29))).toBe("upcoming");
    });

    test("is in progress from the moment it starts", () => {
        expect(status(local(9, 30))).toBe("inProgress");
        expect(status(local(10, 29))).toBe("inProgress");
    });

    test("is completed from the moment it ends", () => {
        expect(status(local(10, 30))).toBe("completed");
        expect(status(local(23))).toBe("completed");
    });

    describe("without a computable schedule", () => {
        test("is in progress when the stage says so", () => {
            expect(status(local(12), { targetDate: undefined, stage: "inProgress" })).toBe("inProgress");
        });

        test.each(["open", "draft", undefined])("is upcoming for the stage %p", (stage) => {
            expect(status(local(12), { shiftStartTime: undefined, stage })).toBe("upcoming");
            expect(status(local(12), { shiftDurationMinutes: undefined, stage })).toBe("upcoming");
        });
    });

    test("defaults to the current time", () => {
        const farFuture = shift({ targetDate: new Date(Date.now() + 400 * 24 * 60 * 60 * 1000) });
        const farPast = shift({ targetDate: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000) });

        expect(getShiftDisplayStatus(farFuture)).toBe("upcoming");
        expect(getShiftDisplayStatus(farPast)).toBe("completed");
    });
});

describe("signup counts and summaries", () => {
    const withParticipants = (participants: TaskParticipant[] | undefined, slots?: number) => ({ participants, slots }) as Pick<Task, "participants" | "slots">;

    describe("getShiftSignupSummary / getShiftSignedUpCount", () => {
        test("counts every participant against the slots", () => {
            const task = withParticipants([participant("a", true), participant("b")], 5);

            expect(getShiftSignupSummary(task)).toBe("2 / 5 signed up");
            expect(getShiftSignedUpCount(task)).toBe(2);
        });

        test("shows a question mark when the slot count is unknown", () => {
            expect(getShiftSignupSummary(withParticipants([participant("a")]))).toBe("1 / ? signed up");
        });

        test("treats a missing participant list as empty", () => {
            expect(getShiftSignupSummary(withParticipants(undefined, 3))).toBe("0 / 3 signed up");
            expect(getShiftSignedUpCount(withParticipants(undefined))).toBe(0);
        });

        test("shows zero slots as 0, not unknown", () => {
            expect(getShiftSignupSummary(withParticipants([], 0))).toBe("0 / 0 signed up");
        });
    });

    describe("confirmed and pending", () => {
        const task = withParticipants([participant("a", true), participant("b"), participant("c", true), participant("d")], 6);

        test("counts participants with and without verification", () => {
            expect(getShiftConfirmedCount(task)).toBe(2);
            expect(getShiftPendingCount(task)).toBe(2);
        });

        test("count zero without participants", () => {
            expect(getShiftConfirmedCount(withParticipants(undefined))).toBe(0);
            expect(getShiftPendingCount(withParticipants(undefined))).toBe(0);
        });

        test("summarizes confirmed signups", () => {
            expect(getShiftConfirmedSummary(task)).toBe("2 / 6 confirmed");
            expect(getShiftConfirmedSummary(withParticipants([]))).toBe("0 / ? confirmed");
        });

        test("summarizes pending signups only when there are some", () => {
            expect(getShiftPendingSummary(withParticipants([participant("a", true)]))).toBeNull();
            expect(getShiftPendingSummary(withParticipants(undefined))).toBeNull();
            expect(getShiftPendingSummary(withParticipants([participant("a")]))).toBe("1 pending");
            expect(getShiftPendingSummary(task)).toBe("2 pending");
        });

        test("confirmed plus pending equals signed up", () => {
            expect(getShiftConfirmedCount(task) + getShiftPendingCount(task)).toBe(getShiftSignedUpCount(task));
        });
    });
});

describe("participant entries", () => {
    const profile = (did: string) => ({ did, name: did }) as unknown as Circle;
    const task = (participants: TaskParticipant[] | undefined, participantProfiles?: Circle[]) =>
        ({ participants, participantProfiles }) as Pick<TaskDisplay, "participants" | "participantProfiles">;

    test("pairs confirmed participants with their profiles", () => {
        const result = getShiftConfirmedParticipants(task([participant("a", true), participant("b")], [profile("a"), profile("b")]));

        expect(result).toEqual([{ participant: participant("a", true), profile: profile("a") }]);
    });

    test("pairs pending participants with their profiles", () => {
        const result = getShiftPendingParticipants(task([participant("a", true), participant("b")], [profile("a"), profile("b")]));

        expect(result).toEqual([{ participant: participant("b"), profile: profile("b") }]);
    });

    test("keeps the original order", () => {
        const result = getShiftPendingParticipants(task([participant("c"), participant("a"), participant("b")]));

        expect(result.map((entry) => entry.participant.userDid)).toEqual(["c", "a", "b"]);
    });

    test("leaves the profile undefined when it is not loaded", () => {
        expect(getShiftPendingParticipants(task([participant("a")], [profile("other")]))[0].profile).toBeUndefined();
        expect(getShiftPendingParticipants(task([participant("a")]))[0].profile).toBeUndefined();
    });

    test("returns nothing without participants", () => {
        expect(getShiftConfirmedParticipants(task(undefined))).toEqual([]);
        expect(getShiftPendingParticipants(task([]))).toEqual([]);
    });

    test("splits participants into two disjoint groups that together cover everyone", () => {
        const all = task([participant("a", true), participant("b"), participant("c", true)]);

        const confirmed = getShiftConfirmedParticipants(all).map((entry) => entry.participant.userDid);
        const pending = getShiftPendingParticipants(all).map((entry) => entry.participant.userDid);

        expect([...confirmed, ...pending].sort()).toEqual(["a", "b", "c"]);
        expect(confirmed.filter((did) => pending.includes(did))).toEqual([]);
    });
});
