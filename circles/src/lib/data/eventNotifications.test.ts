import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { Circle, EventStage } from "@/models/models";
import { silenceConsole } from "@/test/hooks";
import { features } from "./constants";

const sendNotifications = mock(async (..._args: unknown[]) => {});
mock.module("@/lib/data/notifications", () => ({ sendNotifications }));

const getUserPrivate = mock(async (did: string): Promise<Record<string, unknown> | null> => ({ did, private: true }));
mock.module("@/lib/data/user", () => ({ getUserPrivate }));

const getCircleById = mock(async (_id: string): Promise<Record<string, unknown> | null> => ({ _id: "circle-1", name: "Circle" }));
mock.module("@/lib/data/circle", () => ({ getCircleById }));

const getAuthorizedMembers = mock(async (_circle: unknown, _feature: unknown): Promise<Record<string, unknown>[]> => []);
mock.module("@/lib/auth/auth", () => ({ getAuthorizedMembers }));

const { notifyEventApproved, notifyEventStatusChanged, notifyEventSubmittedForReview } = await import("./eventNotifications");

const objectIdLike = { toString: () => "event-1" };
const event = { _id: objectIdLike, title: "Beach cleanup", circleId: "circle-1", createdBy: "did:author", stage: "open" } as never;
const person = (did: string) => ({ did, name: did }) as unknown as Circle;

const consoleSpy = silenceConsole("error");

beforeEach(() => {
    sendNotifications.mockReset();
    sendNotifications.mockResolvedValue(undefined);
    getUserPrivate.mockReset();
    getUserPrivate.mockImplementation(async (did) => ({ did, private: true }));
    getCircleById.mockReset();
    getCircleById.mockResolvedValue({ _id: "circle-1", name: "Circle" });
    getAuthorizedMembers.mockReset();
    getAuthorizedMembers.mockResolvedValue([]);
});

describe("notifyEventSubmittedForReview", () => {
    const submitter = person("did:submitter");

    test("notifies everyone with review permission except the submitter", async () => {
        getAuthorizedMembers.mockResolvedValue([{ did: "did:reviewer-1" }, { did: "did:submitter" }, { did: "did:reviewer-2" }]);

        await notifyEventSubmittedForReview(event, submitter);

        expect(getAuthorizedMembers).toHaveBeenCalledWith({ _id: "circle-1", name: "Circle" }, features.events.review);
        expect(sendNotifications).toHaveBeenCalledWith(
            "event_submitted_for_review",
            [
                { did: "did:reviewer-1", private: true },
                { did: "did:reviewer-2", private: true },
            ],
            {
                circle: { _id: "circle-1", name: "Circle" },
                user: submitter,
                eventId: "event-1",
                eventTitle: "Beach cleanup",
            },
        );
    });

    test("does nothing when the circle cannot be found", async () => {
        getCircleById.mockResolvedValue(null);

        await notifyEventSubmittedForReview(event, submitter);

        expect(getAuthorizedMembers).not.toHaveBeenCalled();
        expect(sendNotifications).not.toHaveBeenCalled();
    });

    test("does nothing when the event has no circle id", async () => {
        await notifyEventSubmittedForReview({ ...(event as object), circleId: undefined } as never, submitter);

        expect(getCircleById).not.toHaveBeenCalled();
        expect(sendNotifications).not.toHaveBeenCalled();
    });

    test("does nothing when there are no reviewers", async () => {
        await notifyEventSubmittedForReview(event, submitter);

        expect(sendNotifications).not.toHaveBeenCalled();
    });

    test("does nothing when the submitter is the only reviewer", async () => {
        getAuthorizedMembers.mockResolvedValue([{ did: "did:submitter" }]);

        await notifyEventSubmittedForReview(event, submitter);

        expect(getUserPrivate).not.toHaveBeenCalled();
        expect(sendNotifications).not.toHaveBeenCalled();
    });

    test("ignores members without a did", async () => {
        getAuthorizedMembers.mockResolvedValue([{ name: "no did" }, { did: "" }, { did: "did:reviewer" }]);

        await notifyEventSubmittedForReview(event, submitter);

        expect(getUserPrivate.mock.calls.map(([did]) => did)).toEqual(["did:reviewer"]);
    });

    test("skips reviewers whose private profile is missing", async () => {
        getAuthorizedMembers.mockResolvedValue([{ did: "did:a" }, { did: "did:b" }]);
        getUserPrivate.mockImplementation(async (did) => (did === "did:a" ? null : { did, private: true }));

        await notifyEventSubmittedForReview(event, submitter);

        expect(sendNotifications.mock.calls[0][1]).toEqual([{ did: "did:b", private: true }]);
    });

    test("does nothing when none of the reviewers have a private profile", async () => {
        getAuthorizedMembers.mockResolvedValue([{ did: "did:a" }]);
        getUserPrivate.mockResolvedValue(null);

        await notifyEventSubmittedForReview(event, submitter);

        expect(sendNotifications).not.toHaveBeenCalled();
    });

    test("converts the event id to a string, falling back to String() for a missing id", async () => {
        getAuthorizedMembers.mockResolvedValue([{ did: "did:reviewer" }]);

        await notifyEventSubmittedForReview({ ...(event as object), _id: undefined } as never, submitter);

        expect((sendNotifications.mock.calls[0][2] as { eventId: string }).eventId).toBe("undefined");
    });

    test("never rejects, and logs the failure", async () => {
        getAuthorizedMembers.mockRejectedValue(new Error("auth down"));

        await expect(notifyEventSubmittedForReview(event, submitter)).resolves.toBeUndefined();

        expect(consoleSpy.error).toHaveBeenCalledWith("Error in notifyEventSubmittedForReview:", expect.any(Error));
    });

    test("strips non-integer numbers from the payload so it can cross the JSON boundary", async () => {
        getCircleById.mockResolvedValue({ _id: "circle-1", name: "Circle", rating: 4.5 });
        getAuthorizedMembers.mockResolvedValue([{ did: "did:reviewer" }]);

        await notifyEventSubmittedForReview(event, submitter);

        expect((sendNotifications.mock.calls[0][2] as { circle: { rating: unknown } }).circle.rating).toBe("4.5");
    });
});

describe("notifyEventApproved", () => {
    const approver = person("did:approver");

    test("tells the author that their event was approved", async () => {
        await notifyEventApproved(event, approver);

        expect(getUserPrivate).toHaveBeenCalledWith("did:author");
        expect(sendNotifications).toHaveBeenCalledWith("event_approved", [{ did: "did:author", private: true }], {
            circle: { _id: "circle-1", name: "Circle" },
            user: approver,
            eventId: "event-1",
            eventTitle: "Beach cleanup",
        });
    });

    test("does not notify authors who approve their own event", async () => {
        await notifyEventApproved(event, person("did:author"));

        expect(getUserPrivate).not.toHaveBeenCalled();
        expect(sendNotifications).not.toHaveBeenCalled();
    });

    test("does nothing when the circle cannot be found or the author is unknown", async () => {
        getCircleById.mockResolvedValueOnce(null);
        await notifyEventApproved(event, approver);

        getUserPrivate.mockResolvedValueOnce(null);
        await notifyEventApproved(event, approver);

        expect(sendNotifications).not.toHaveBeenCalled();
    });

    test("never rejects, and logs the failure", async () => {
        sendNotifications.mockRejectedValue(new Error("notifier down"));

        await expect(notifyEventApproved(event, approver)).resolves.toBeUndefined();

        expect(consoleSpy.error).toHaveBeenCalledWith("Error in notifyEventApproved:", expect.any(Error));
    });
});

describe("notifyEventStatusChanged", () => {
    const changer = person("did:changer");

    test("tells the author how the stage changed", async () => {
        await notifyEventStatusChanged(event, changer, "review" as EventStage);

        expect(sendNotifications).toHaveBeenCalledWith("event_status_changed", [{ did: "did:author", private: true }], {
            circle: { _id: "circle-1", name: "Circle" },
            user: changer,
            eventId: "event-1",
            eventTitle: "Beach cleanup",
            eventOldStage: "review",
            eventNewStage: "open",
        });
    });

    test("does not notify authors who change the status of their own event", async () => {
        await notifyEventStatusChanged(event, person("did:author"), "review" as EventStage);

        expect(sendNotifications).not.toHaveBeenCalled();
    });

    test("does nothing when the circle cannot be found or the author is unknown", async () => {
        getCircleById.mockResolvedValueOnce(null);
        await notifyEventStatusChanged(event, changer, "draft" as EventStage);

        getUserPrivate.mockResolvedValueOnce(null);
        await notifyEventStatusChanged(event, changer, "draft" as EventStage);

        expect(sendNotifications).not.toHaveBeenCalled();
    });

    test("never rejects, and logs the failure", async () => {
        getUserPrivate.mockRejectedValue(new Error("db down"));

        await expect(notifyEventStatusChanged(event, changer, "draft" as EventStage)).resolves.toBeUndefined();

        expect(consoleSpy.error).toHaveBeenCalledWith("Error in notifyEventStatusChanged:", expect.any(Error));
    });
});
