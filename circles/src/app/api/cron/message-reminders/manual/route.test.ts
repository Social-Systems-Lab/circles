import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { setEnv, snapshotEnv } from "@/test/env";
import { silenceConsole } from "@/test/hooks";
import { createBearerRequest, createJsonRequest } from "@/test/next-request";

const processMessageEmailReminderById = mock(async (_id: string): Promise<Record<string, unknown>> => ({ code: "sent", reminderId: "r1" }));
mock.module("@/lib/data/message-reminders", () => ({ processMessageEmailReminderById }));

const { POST } = await import("./route");

const restoreEnv = snapshotEnv("CRON_SECRET");
const consoleSpy = silenceConsole("error");

const authorized = { authorization: "Bearer cron-secret" };
const post = (body: unknown, headers: Record<string, string> = authorized) => POST(createJsonRequest(body, { headers }));

beforeEach(() => {
    setEnv("CRON_SECRET", "cron-secret");
    processMessageEmailReminderById.mockReset();
    processMessageEmailReminderById.mockResolvedValue({ code: "sent", reminderId: "r1" });
});

afterEach(() => {
    restoreEnv();
});

describe("POST /api/cron/message-reminders/manual", () => {
    describe("authorization", () => {
        test("rejects requests without the cron secret before reading the body", async () => {
            for (const request of [createJsonRequest({ reminderId: "r1" }), createBearerRequest("wrong", { method: "POST" })]) {
                const response = await POST(request);

                expect(response.status).toBe(401);
                expect(await response.json()).toEqual({ error: "Unauthorized" });
            }
            expect(processMessageEmailReminderById).not.toHaveBeenCalled();
        });

        test("rejects everybody when no secret is configured", async () => {
            setEnv("CRON_SECRET", undefined);

            expect((await post({ reminderId: "r1" }, { authorization: "Bearer undefined" })).status).toBe(401);
            expect((await post({ reminderId: "r1" }, { authorization: "Bearer " })).status).toBe(401);
        });
    });

    describe("validation", () => {
        test.each([
            ["a missing reminder id", {}],
            ["an empty reminder id", { reminderId: "" }],
            ["a blank reminder id", { reminderId: "   " }],
            ["a non-string reminder id", { reminderId: 5 }],
            ["a null body", null],
            ["a non-object body", "nonsense"],
        ])("rejects %s", async (_label, body) => {
            const response = await post(body);

            expect(response.status).toBe(400);
            expect(await response.json()).toEqual({ error: "reminderId is required" });
            expect(processMessageEmailReminderById).not.toHaveBeenCalled();
        });

        test("rejects a body that is not JSON", async () => {
            const response = await POST(createJsonRequest("{broken", { headers: authorized }));

            expect(response.status).toBe(400);
            expect((await response.json()).error).toBe("reminderId is required");
        });

        test("trims the reminder id", async () => {
            await post({ reminderId: "  r1  " });

            expect(processMessageEmailReminderById).toHaveBeenCalledWith("r1");
        });
    });

    describe("results", () => {
        test("reports success together with the processing result", async () => {
            const response = await post({ reminderId: "r1" });

            expect(response.status).toBe(200);
            expect(await response.json()).toEqual({ success: true, code: "sent", reminderId: "r1" });
        });

        test.each([
            ["invalid_id", 400],
            ["not_found", 404],
            ["not_pending", 409],
        ])("maps the %s result to HTTP %d and returns it unchanged", async (code, status) => {
            processMessageEmailReminderById.mockResolvedValue({ code, message: "details" });

            const response = await post({ reminderId: "r1" });

            expect(response.status).toBe(status);
            expect(await response.json()).toEqual({ code, message: "details" });
        });

        test.each(["sent", "skipped", "failed"])("treats the %s outcome as a successful request", async (code) => {
            processMessageEmailReminderById.mockResolvedValue({ code });

            const response = await post({ reminderId: "r1" });

            expect(response.status).toBe(200);
            expect(await response.json()).toEqual({ success: true, code });
        });

        test("returns a 500 without leaking details when processing throws, and logs the error", async () => {
            processMessageEmailReminderById.mockRejectedValue(new Error("secret internals"));

            const response = await post({ reminderId: "r1" });

            expect(response.status).toBe(500);
            expect(await response.json()).toEqual({ error: "Internal Server Error" });
            expect(consoleSpy.error).toHaveBeenCalledWith("Error processing manual message reminder:", expect.any(Error));
        });
    });
});
