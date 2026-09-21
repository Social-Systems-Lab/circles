import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import crypto from "node:crypto";
import { ObjectId } from "mongodb";
import { setEnv, snapshotEnv } from "@/test/env";
import { silenceConsole, useFakeNow } from "@/test/hooks";
import { mockDb, namedCollection } from "@/test/mock-db";
import { createRequest } from "@/test/next-request";

const SECRET = "donorbox-secret";
const restoreEnv = snapshotEnv("DONORBOX_WEBHOOK_SECRET", "CIRCLES_URL");
setEnv("DONORBOX_WEBHOOK_SECRET", SECRET);

const db = mockDb();

const sendUserBecomesMemberNotification = mock(async (_user: unknown) => {});
mock.module("@/lib/data/notifications", () => ({ sendUserBecomesMemberNotification }));

const getUserPrivate = mock(async (did: string): Promise<Record<string, unknown> | null> => ({ did, private: true }));
mock.module("@/lib/data/user", () => ({ getUserPrivate }));

const sendEmail = mock(async (_message: unknown) => {});
mock.module("@/lib/data/email", () => ({ sendEmail }));

// The secret is captured when the module loads, so the "not configured" case gets its own instance.
const { POST } = await import("./route");

const NOW = new Date("2026-06-15T12:00:00.000Z");
useFakeNow(NOW);
const circles = () => namedCollection(db, "circles");
const storedUser = (id: ObjectId) => circles().byId(id)!;

const sign = (body: string, timestamp = "1700000000", secret = SECRET) =>
    `${timestamp},${crypto.createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
const send = (payload: unknown, headerOverride?: string | null) => {
    const body = typeof payload === "string" ? payload : JSON.stringify(payload);
    const headers: Record<string, string> = {};
    const header = headerOverride === undefined ? sign(body) : headerOverride;
    if (header !== null) headers["donorbox-signature"] = header;
    return POST(createRequest("/api/donorbox", { method: "POST", headers, body }));
};

const seedUser = (overrides: Record<string, unknown> = {}) => {
    const _id = new ObjectId();
    circles().docs.push({ _id, did: "did:vee", name: "Vee", email: "vee@example.com", circleType: "user", ...overrides });
    return _id;
};

const donation = (overrides: Record<string, unknown> = {}) => ({
    event_name: "donation.created",
    donation: {
        id: 555,
        recurring: true,
        donor: { id: 77, email: "vee@example.com" },
        amount: "12.50",
        currency: "EUR",
        donation_date: "2026-06-01T10:00:00Z",
        plan_id: 9001,
        ...overrides,
    },
});
const plan = (overrides: Record<string, unknown> = {}, eventName = "plan.updated") => ({
    event_name: eventName,
    plan: { donor: { email: "vee@example.com" }, status: "active", last_donation_date: "2026-06-10T10:00:00Z", ...overrides },
});

const consoleSpy = silenceConsole("log", "error");

beforeEach(() => {
    circles().docs = [];
    for (const fn of [sendUserBecomesMemberNotification, getUserPrivate, sendEmail]) fn.mockClear();
    getUserPrivate.mockImplementation(async (did) => ({ did, private: true }));
    setEnv("CIRCLES_URL", undefined);
});

afterAll(restoreEnv);

describe("signature verification", () => {
    test("rejects a request without a signature header", async () => {
        const response = await send(donation(), null);

        expect(response.status).toBe(401);
        expect(await response.json()).toEqual({ error: "Missing signature" });
    });

    test("rejects a signature made with another secret", async () => {
        const body = JSON.stringify(donation());

        const response = await send(body, sign(body, "1700000000", "someone-elses-secret"));

        expect(response.status).toBe(401);
        expect(await response.json()).toEqual({ error: "Invalid signature" });
    });

    test("rejects a body that was changed after signing", async () => {
        const original = JSON.stringify(donation({ amount: "1.00" }));
        const tampered = JSON.stringify(donation({ amount: "1000.00" }));

        expect((await send(tampered, sign(original))).status).toBe(401);
    });

    test("binds the signature to its timestamp", async () => {
        const body = JSON.stringify(donation());
        const [, signature] = sign(body, "1700000000").split(",");

        expect((await send(body, `1700000001,${signature}`)).status).toBe(401);
    });

    test("rejects a header without a signature part", async () => {
        expect((await send(donation(), "1700000000")).status).toBe(401);
        expect((await send(donation(), "")).status).toBe(401);
    });

    test("does not process anything for a rejected request", async () => {
        const id = seedUser();

        await send(donation(), "1700000000,bad");

        expect(getUserPrivate).not.toHaveBeenCalled();
        expect(storedUser(id).isMember).toBeUndefined();
    });

    test("accepts any timestamp, since it does not check for replays", async () => {
        const body = JSON.stringify({ event_name: "ignored" });

        expect((await send(body, sign(body, "1"))).status).toBe(200);
        expect((await send(body, sign(body, "9999999999"))).status).toBe(200);
    });

    test("fails with a 500 when no secret is configured", async () => {
        setEnv("DONORBOX_WEBHOOK_SECRET", undefined);
        const specifier = "./route?unconfigured";
        const unconfigured = (await import(specifier)) as typeof import("./route");
        setEnv("DONORBOX_WEBHOOK_SECRET", SECRET);

        const response = await unconfigured.POST(
            createRequest("/", { method: "POST", headers: { "donorbox-signature": "x,y" }, body: "[]" }),
        );

        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({ error: "Internal server error" });
        expect(consoleSpy.error).toHaveBeenCalledWith("DONORBOX_WEBHOOK_SECRET is not set");
    });

    // The body is parsed outside the try/catch, so a correctly signed payload that is not JSON escapes as an exception.
    test("currently lets a signed body that is not JSON throw", async () => {
        const body = "{broken";

        await expect(send(body, sign(body))).rejects.toThrow();
    });
});

describe("event handling", () => {
    test("acknowledges a single event object as well as a list", async () => {
        seedUser();

        expect(await (await send(donation())).json()).toEqual({ status: "ok" });
        expect(await (await send([donation()])).json()).toEqual({ status: "ok" });
    });

    test("acknowledges an empty list", async () => {
        expect(await (await send([])).json()).toEqual({ status: "ok" });
    });

    test("skips events it does not handle", async () => {
        const id = seedUser();

        const response = await send([
            { event_name: "donation.refunded" },
            { event_name: "donation.created", donation: { recurring: false } },
            donation({ recurring: "true" }),
        ]);

        expect(response.status).toBe(200);
        expect(storedUser(id).isMember).toBeUndefined();
        expect(consoleSpy.log).toHaveBeenCalledWith("Unhandled event: donation.refunded. Skipping.");
    });

    test("only treats a donation as a subscription when recurring is exactly true", async () => {
        const id = seedUser();

        await send(donation({ recurring: 1 }));

        expect(storedUser(id).isMember).toBeUndefined();
    });

    test("handles every event of a batch in order", async () => {
        const first = seedUser({ email: "a@example.com", did: "did:a" });
        const second = seedUser({ email: "b@example.com", did: "did:b" });

        await send([donation({ donor: { id: 1, email: "a@example.com" } }), donation({ donor: { id: 2, email: "b@example.com" } })]);

        expect(storedUser(first).isMember).toBe(true);
        expect(storedUser(second).isMember).toBe(true);
    });

    test("stops at the first failing event and reports a 500", async () => {
        const later = seedUser({ email: "later@example.com" });

        const response = await send([
            { event_name: "donation.created", donation: { recurring: true } },
            donation({ donor: { id: 2, email: "later@example.com" } }),
        ]);

        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({ error: "Error processing webhook" });
        expect(consoleSpy.error).toHaveBeenCalledWith("Error processing webhook:", expect.any(Error));
        expect(storedUser(later).isMember).toBeUndefined();
    });
});

describe("new recurring donation", () => {
    test("makes the donor an active, verified member and records the subscription", async () => {
        const id = seedUser();

        await send(donation());

        expect(storedUser(id)).toMatchObject({
            isMember: true,
            isVerified: true,
            accountStatus: "active",
            verifiedAt: NOW,
            verifiedBy: "system:payment",
            subscription: {
                donorboxPlanId: "9001",
                donorboxDonationId: 555,
                donorboxDonorId: 77,
                status: "active",
                amount: 12.5,
                currency: "EUR",
                startDate: new Date("2026-06-01T10:00:00Z"),
            },
        });
    });

    test("welcomes a donor who was not a member yet", async () => {
        seedUser();

        await send(donation());

        expect(getUserPrivate).toHaveBeenCalledWith("did:vee");
        expect(sendUserBecomesMemberNotification).toHaveBeenCalledWith({ did: "did:vee", private: true });
        expect(sendEmail).toHaveBeenCalledWith({
            to: "vee@example.com",
            templateAlias: "new-member-welcome",
            templateModel: { name: "Vee", action_url: "http://localhost:3000" },
        });
    });

    test("links the welcome email to CIRCLES_URL when configured", async () => {
        seedUser();
        setEnv("CIRCLES_URL", "https://kamooni.example");

        await send(donation());

        expect((sendEmail.mock.calls[0][0] as { templateModel: { action_url: string } }).templateModel.action_url).toBe(
            "https://kamooni.example",
        );
    });

    test("does not welcome an existing member again but still updates the subscription", async () => {
        const id = seedUser({ isMember: true, accountStatus: "active" });

        await send(donation());

        expect(sendEmail).not.toHaveBeenCalled();
        expect(sendUserBecomesMemberNotification).not.toHaveBeenCalled();
        expect(storedUser(id).subscription.donorboxPlanId).toBe("9001");
    });

    test("does not overwrite the verification record of an account that was already active", async () => {
        const verifiedAt = new Date("2026-01-01T00:00:00.000Z");
        const id = seedUser({ accountStatus: "active", verifiedAt, verifiedBy: "did:admin" });

        await send(donation());

        expect(storedUser(id)).toMatchObject({ verifiedAt, verifiedBy: "did:admin" });
    });

    test("does not send the welcome when the private profile cannot be loaded", async () => {
        seedUser();
        getUserPrivate.mockResolvedValue(null);

        await send(donation());

        expect(sendEmail).not.toHaveBeenCalled();
        expect(circles().docs[0].isMember).toBe(true);
    });

    test("ignores a donor who has no account", async () => {
        const response = await send(donation({ donor: { id: 1, email: "nobody@example.com" } }));

        expect(response.status).toBe(200);
        expect(consoleSpy.error).toHaveBeenCalledWith("User with email nobody@example.com not found.");
        expect(sendEmail).not.toHaveBeenCalled();
    });

    test("only matches personal profiles by email", async () => {
        circles().docs.push({ _id: new ObjectId(), email: "vee@example.com", circleType: "circle" });

        await send(donation());

        expect(circles().docs[0].isMember).toBeUndefined();
    });

    test("stores the plan id as a string and the amount as a number", async () => {
        const id = seedUser();

        await send(donation({ plan_id: 42, amount: "3" }));

        expect(storedUser(id).subscription).toMatchObject({ donorboxPlanId: "42", amount: 3 });
    });

    test("fails when the donation has no plan id, since the plan id is required", async () => {
        seedUser();

        const response = await send(donation({ plan_id: undefined }));

        expect(response.status).toBe(500);
    });
});

describe("plan updates", () => {
    test.each(["plan.updated", "plan.created"])("%s updates the subscription of an active plan", async (eventName) => {
        const id = seedUser({ isMember: true, accountStatus: "active" });

        await send(plan({}, eventName));

        expect(storedUser(id)).toMatchObject({
            isMember: true,
            isVerified: true,
            accountStatus: "active",
            subscription: { status: "active", lastPaymentDate: new Date("2026-06-10T10:00:00Z") },
        });
    });

    test("activates and welcomes a donor whose plan becomes active", async () => {
        const id = seedUser();

        await send(plan());

        expect(storedUser(id)).toMatchObject({
            isMember: true,
            accountStatus: "active",
            verifiedAt: NOW,
            verifiedBy: "system:payment",
        });
        expect(sendEmail).toHaveBeenCalledTimes(1);
        expect(sendUserBecomesMemberNotification).toHaveBeenCalledTimes(1);
    });

    test.each(["cancelled", "paused", "failed"])("removes membership and verification when the plan is %s", async (status) => {
        const id = seedUser({ isMember: true, isVerified: true, accountStatus: "active" });

        await send(plan({ status }));

        expect(storedUser(id)).toMatchObject({ isMember: false, isVerified: false, subscription: { status } });
    });

    test("leaves the account status alone when the plan is not active", async () => {
        const id = seedUser({ isMember: true, accountStatus: "active" });

        await send(plan({ status: "cancelled" }));

        expect(storedUser(id).accountStatus).toBe("active");
        expect(storedUser(id).verifiedAt).toBeUndefined();
        expect(sendEmail).not.toHaveBeenCalled();
    });

    test("does not welcome a member whose plan stays active", async () => {
        seedUser({ isMember: true, accountStatus: "active" });

        await send(plan());

        expect(sendEmail).not.toHaveBeenCalled();
    });

    test("does not mark an active account as newly verified", async () => {
        const id = seedUser({ accountStatus: "active" });

        await send(plan());

        expect(storedUser(id).verifiedAt).toBeUndefined();
    });

    test("ignores a donor who has no account", async () => {
        const response = await send(plan({ donor: { email: "nobody@example.com" } }));

        expect(response.status).toBe(200);
        expect(consoleSpy.error).toHaveBeenCalledWith("User with email nobody@example.com not found for plan update.");
    });
});
