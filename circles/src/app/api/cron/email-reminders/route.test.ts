import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { setEnv, snapshotEnv } from "@/test/env";
import { silenceConsole } from "@/test/hooks";
import { createBearerRequest, createRequest } from "@/test/next-request";

const processDailyActionableEmailDigests = mock(async (): Promise<Record<string, unknown>> => ({ sent: 3, skipped: 1 }));
mock.module("@/lib/data/actionable-email-digests", () => ({ processDailyActionableEmailDigests }));

const { GET } = await import("./route");

const restoreEnv = snapshotEnv("CRON_SECRET");
const consoleSpy = silenceConsole("error");

beforeEach(() => {
    setEnv("CRON_SECRET", "cron-secret");
    processDailyActionableEmailDigests.mockReset();
    processDailyActionableEmailDigests.mockResolvedValue({ sent: 3, skipped: 1 });
});

afterEach(() => {
    restoreEnv();
});

const expectUnauthorized = async (response: Response) => {
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(processDailyActionableEmailDigests).not.toHaveBeenCalled();
};

describe("GET cron digest endpoint", () => {
    test("runs the daily digests for a caller with the cron secret and reports the result", async () => {
        const response = await GET(createBearerRequest("cron-secret"));

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ success: true, sent: 3, skipped: 1 });
        expect(processDailyActionableEmailDigests).toHaveBeenCalledTimes(1);
    });

    describe("authorization", () => {
        test("rejects a request without an authorization header", async () => {
            await expectUnauthorized(await GET(createRequest("/")));
        });

        test("rejects the wrong token", async () => {
            await expectUnauthorized(await GET(createBearerRequest("wrong")));
        });

        test("rejects everybody when no secret is configured, even with an empty token", async () => {
            setEnv("CRON_SECRET", undefined);

            await expectUnauthorized(await GET(createBearerRequest("anything")));
            await expectUnauthorized(await GET(createRequest("/", { headers: { authorization: "Bearer " } })));
        });

        test("rejects everybody when the configured secret is empty", async () => {
            setEnv("CRON_SECRET", "");

            await expectUnauthorized(await GET(createRequest("/", { headers: { authorization: "Bearer " } })));
        });

        test("rejects a header without a token part", async () => {
            await expectUnauthorized(await GET(createRequest("/", { headers: { authorization: "Bearer" } })));
        });

        test("rejects a token that only starts with or contains the secret", async () => {
            await expectUnauthorized(await GET(createBearerRequest("cron-secret-extra")));
            await expectUnauthorized(await GET(createBearerRequest("xcron-secret")));
        });

        test("does not check the scheme, only the second word", async () => {
            const response = await GET(createRequest("/", { headers: { authorization: "Basic cron-secret" } }));

            expect(response.status).toBe(200);
        });

        test("only considers the second word of the header", async () => {
            await expectUnauthorized(await GET(createRequest("/", { headers: { authorization: "Bearer wrong cron-secret" } })));
        });
    });

    test("returns a 500 without leaking details when processing fails, and logs the error", async () => {
        processDailyActionableEmailDigests.mockRejectedValue(new Error("smtp credentials leaked"));

        const response = await GET(createBearerRequest("cron-secret"));

        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({ error: "Internal Server Error" });
        expect(consoleSpy.error).toHaveBeenCalledWith("Error processing actionable email digests:", expect.any(Error));
    });

    test("lets the digest result override nothing but success", async () => {
        processDailyActionableEmailDigests.mockResolvedValue({ success: false });

        expect(await (await GET(createBearerRequest("cron-secret"))).json()).toEqual({ success: false });
    });
});
