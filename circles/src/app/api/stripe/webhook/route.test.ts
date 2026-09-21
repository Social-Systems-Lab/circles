import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { ObjectId } from "mongodb";
import { setEnv, snapshotEnv } from "@/test/env";
import { silenceConsole, useFakeNow } from "@/test/hooks";
import { createRequest } from "@/test/next-request";

const restoreEnv = snapshotEnv("STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET");
setEnv("STRIPE_SECRET_KEY", "sk_test_webhook");

// The SDK's signature check is replaced: a signature of "invalid" fails, anything else yields the JSON body as the event.
const constructEvent = mock((body: string, signature: string, secret: string) => {
    if (signature === "invalid") throw new Error("No signatures found matching the expected signature for payload");
    void secret;
    return JSON.parse(body);
});
mock.module("stripe", () => ({
    default: class FakeStripe {
        webhooks = { constructEvent };
    },
}));

const applyStripeMembershipUpdate = mock(async (_update: Record<string, unknown>) => {});
const getUserByEmail = mock(async (_email: string): Promise<Record<string, any> | null> => null);
const getUserByStripeCustomerId = mock(async (_id: string): Promise<Record<string, any> | null> => null);
const getUserByStripeSubscriptionId = mock(async (_id: string): Promise<Record<string, any> | null> => null);
const markStripeWebhookEventProcessed = mock(async (_eventId: string, _type: string) => true);
mock.module("@/lib/data/membership", () => ({
    applyStripeMembershipUpdate,
    getUserByEmail,
    getUserByStripeCustomerId,
    getUserByStripeSubscriptionId,
    markStripeWebhookEventProcessed,
}));

const { POST, runtime } = await import("./route");

const NOW = new Date("2026-06-15T12:00:00.000Z");
useFakeNow(NOW);
const FUTURE_S = Math.floor(NOW.getTime() / 1000) + 30 * 24 * 3600;
const PAST_S = Math.floor(NOW.getTime() / 1000) - 24 * 3600;
const userId = new ObjectId();
const knownUser = { _id: userId, subscription: {} };

const consoleSpy = silenceConsole("error", "warn", "log");

const event = (type: string, object: Record<string, unknown>, id = "evt_1") => ({ id, type, data: { object } });
const send = (payload: unknown, headers: Record<string, string> = { "stripe-signature": "valid" }) =>
    POST(createRequest("/api/stripe/webhook", { method: "POST", headers, body: typeof payload === "string" ? payload : JSON.stringify(payload) }));
const lastUpdate = () => applyStripeMembershipUpdate.mock.calls[0][0] as Record<string, any>;

beforeEach(() => {
    setEnv("STRIPE_WEBHOOK_SECRET", "whsec_test");
    for (const fn of [constructEvent, applyStripeMembershipUpdate, getUserByEmail, getUserByStripeCustomerId, getUserByStripeSubscriptionId, markStripeWebhookEventProcessed]) {
        fn.mockClear();
    }
    applyStripeMembershipUpdate.mockResolvedValue(undefined);
    getUserByEmail.mockResolvedValue(null);
    getUserByStripeCustomerId.mockResolvedValue(null);
    getUserByStripeSubscriptionId.mockResolvedValue(null);
    markStripeWebhookEventProcessed.mockResolvedValue(true);
});

afterAll(restoreEnv);

describe("route configuration", () => {
    test("runs on the node runtime", () => {
        expect(runtime).toBe("nodejs");
    });
});

describe("request verification", () => {
    test("rejects a request without a signature header before doing anything", async () => {
        const response = await send({}, {});

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: "Missing stripe-signature header" });
        expect(constructEvent).not.toHaveBeenCalled();
        expect(markStripeWebhookEventProcessed).not.toHaveBeenCalled();
    });

    test("verifies the raw body with the signature and the configured secret", async () => {
        const body = JSON.stringify(event("ping", {}));

        await send(body, { "stripe-signature": "t=1,v1=abc" });

        expect(constructEvent).toHaveBeenCalledWith(body, "t=1,v1=abc", "whsec_test");
    });

    test("rejects an invalid signature with the verifier's message and does not process the event", async () => {
        const response = await send(event("invoice.paid", {}), { "stripe-signature": "invalid" });

        expect(response.status).toBe(400);
        expect((await response.json()).error).toContain("No signatures found");
        expect(markStripeWebhookEventProcessed).not.toHaveBeenCalled();
        expect(applyStripeMembershipUpdate).not.toHaveBeenCalled();
        expect(consoleSpy.error).toHaveBeenCalledWith("Stripe webhook error:", expect.any(Error));
    });

    test("fails when the webhook secret is not configured", async () => {
        setEnv("STRIPE_WEBHOOK_SECRET", undefined);

        const response = await send(event("ping", {}));

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: "STRIPE_WEBHOOK_SECRET is not configured" });
        expect(constructEvent).not.toHaveBeenCalled();
    });
});

describe("idempotency", () => {
    test("records each event id and type before handling it", async () => {
        await send(event("invoice.paid", {}, "evt_42"));

        expect(markStripeWebhookEventProcessed).toHaveBeenCalledWith("evt_42", "invoice.paid");
    });

    test("acknowledges an event it has already seen without handling it again", async () => {
        markStripeWebhookEventProcessed.mockResolvedValue(false);
        getUserByStripeCustomerId.mockResolvedValue(knownUser);

        const response = await send(event("invoice.paid", { customer: "cus_1" }));

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ received: true, duplicate: true });
        expect(applyStripeMembershipUpdate).not.toHaveBeenCalled();
    });

    // The event is marked processed before the handler runs, so when a handler fails Stripe's retry of the
    // same event is answered as a duplicate and the membership change is not retried.
    test("currently treats the retry of an event whose handler failed as a duplicate", async () => {
        getUserByStripeCustomerId.mockResolvedValue(knownUser);
        applyStripeMembershipUpdate.mockRejectedValueOnce(new Error("db down"));
        const seen = new Set<string>();
        markStripeWebhookEventProcessed.mockImplementation(async (id) => !seen.has(id) && !!seen.add(id));
        const payload = event("invoice.paid", { customer: "cus_1", lines: { data: [] }, amount_paid: 500 });

        expect((await send(payload)).status).toBe(400);
        const retry = await send(payload);

        expect(await retry.json()).toEqual({ received: true, duplicate: true });
        expect(applyStripeMembershipUpdate).toHaveBeenCalledTimes(1);
    });
});

describe("unhandled events", () => {
    test("are acknowledged and logged", async () => {
        const response = await send(event("charge.refunded", {}));

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ received: true });
        expect(consoleSpy.log).toHaveBeenCalledWith("Unhandled Stripe event type: charge.refunded");
        expect(applyStripeMembershipUpdate).not.toHaveBeenCalled();
    });
});

describe("resolving the member", () => {
    const paid = (object: Record<string, unknown>) => send(event("invoice.paid", { lines: { data: [] }, ...object }));

    test("finds the user by subscription id first", async () => {
        getUserByStripeSubscriptionId.mockResolvedValue(knownUser);
        getUserByStripeCustomerId.mockResolvedValue({ _id: new ObjectId() });

        await paid({ subscription: "sub_1", customer: "cus_1" });

        expect(getUserByStripeSubscriptionId).toHaveBeenCalledWith("sub_1");
        expect(getUserByStripeCustomerId).not.toHaveBeenCalled();
        expect(lastUpdate().userId).toBe(userId.toString());
    });

    test("falls back to the customer id when the subscription matches nobody", async () => {
        getUserByStripeCustomerId.mockResolvedValue(knownUser);

        await paid({ subscription: "sub_1", customer: "cus_1" });

        expect(getUserByStripeSubscriptionId).toHaveBeenCalledWith("sub_1");
        expect(getUserByStripeCustomerId).toHaveBeenCalledWith("cus_1");
        expect(lastUpdate().userId).toBe(userId.toString());
    });

    test("accepts an expanded customer object", async () => {
        getUserByStripeCustomerId.mockResolvedValue(knownUser);

        await paid({ customer: { id: "cus_9", email: "x@example.com" } });

        expect(getUserByStripeCustomerId).toHaveBeenCalledWith("cus_9");
    });

    test("falls back to the email when no id matches, trying the customer details first", async () => {
        getUserByEmail.mockResolvedValue(knownUser);

        await paid({ customer: "cus_1", subscription: "sub_1", customer_details: { email: "details@example.com" }, customer_email: "other@example.com" });

        expect(getUserByEmail).toHaveBeenCalledWith("details@example.com");
    });

    test.each([
        ["customer_email", { customer_email: "a@example.com" }, "a@example.com"],
        ["receipt_email", { receipt_email: "b@example.com" }, "b@example.com"],
        ["email", { email: "c@example.com" }, "c@example.com"],
        ["the expanded customer's email", { customer: { email: "d@example.com" } }, "d@example.com"],
    ])("reads the email from %s", async (_label, object, email) => {
        getUserByEmail.mockResolvedValue(knownUser);

        await paid(object);

        expect(getUserByEmail).toHaveBeenCalledWith(email);
    });

    test("ignores lookups it has no identifier for", async () => {
        await paid({});

        expect(getUserByStripeSubscriptionId).not.toHaveBeenCalled();
        expect(getUserByStripeCustomerId).not.toHaveBeenCalled();
        expect(getUserByEmail).not.toHaveBeenCalled();
    });

    test("does nothing but warn when the user cannot be found", async () => {
        const response = await paid({ customer: "cus_1" });

        expect(response.status).toBe(200);
        expect(applyStripeMembershipUpdate).not.toHaveBeenCalled();
        expect(consoleSpy.warn).toHaveBeenCalledWith("Stripe invoice.paid: user not found");
    });

    test("does nothing when the user record has no id", async () => {
        getUserByStripeCustomerId.mockResolvedValue({ subscription: {} });

        await paid({ customer: "cus_1" });

        expect(applyStripeMembershipUpdate).not.toHaveBeenCalled();
    });

    test("uses the subscription object's own id for subscription events", async () => {
        getUserByStripeSubscriptionId.mockResolvedValue(knownUser);

        await send(event("customer.subscription.updated", { id: "sub_77", customer: "cus_1", status: "active", items: { data: [] } }));

        expect(getUserByStripeSubscriptionId).toHaveBeenCalledWith("sub_77");
    });

    test("does not mistake the id of other objects for a subscription id", async () => {
        await paid({ id: "in_123", customer: "cus_1" });

        expect(getUserByStripeSubscriptionId).not.toHaveBeenCalled();
    });
});

describe("checkout.session.completed", () => {
    const completed = (session: Record<string, unknown>) => send(event("checkout.session.completed", { id: "cs_1", mode: "subscription", ...session }, "evt_c"));

    test("activates the membership of the subscribing user", async () => {
        getUserByStripeCustomerId.mockResolvedValue(knownUser);

        await completed({ customer: "cus_1", subscription: "sub_1", metadata: { interval: "year" } });

        expect(lastUpdate()).toEqual({
            userId: userId.toString(),
            stripeCustomerId: "cus_1",
            stripeSubscriptionId: "sub_1",
            stripeCheckoutSessionId: "cs_1",
            status: "active",
            membershipState: "active",
            membershipSource: "stripe",
            interval: "year",
            lastWebhookEventId: "evt_c",
        });
    });

    test.each(["payment", "setup"])("ignores %s mode sessions such as donations", async (mode) => {
        getUserByStripeCustomerId.mockResolvedValue(knownUser);

        const response = await completed({ mode, customer: "cus_1" });

        expect(response.status).toBe(200);
        expect(getUserByStripeCustomerId).not.toHaveBeenCalled();
        expect(applyStripeMembershipUpdate).not.toHaveBeenCalled();
    });

    test.each([["month", "month"], ["year", "year"], ["weekly", undefined], [undefined, undefined]])("reads the interval %p from the metadata as %p", async (interval, expected) => {
        getUserByStripeCustomerId.mockResolvedValue(knownUser);

        await completed({ customer: "cus_1", metadata: interval === undefined ? {} : { interval } });

        expect(lastUpdate().interval).toBe(expected);
    });

    test("omits customer and subscription ids that are not plain strings", async () => {
        getUserByEmail.mockResolvedValue(knownUser);

        await completed({ customer: { id: "cus_1" }, subscription: { id: "sub_1" }, customer_details: { email: "a@example.com" } });

        expect(lastUpdate().stripeCustomerId).toBeUndefined();
        expect(lastUpdate().stripeSubscriptionId).toBeUndefined();
    });

    test("warns and does nothing when the user cannot be found", async () => {
        await completed({ customer: "cus_1" });

        expect(consoleSpy.warn).toHaveBeenCalledWith("Stripe checkout.session.completed: user not found");
        expect(applyStripeMembershipUpdate).not.toHaveBeenCalled();
    });
});

describe("invoice.paid", () => {
    const line = { period: { end: FUTURE_S }, pricing: { price_details: { price: { id: "price_a", recurring: { interval: "month" } } } } };
    const paid = (invoice: Record<string, unknown> = {}) =>
        send(event("invoice.paid", { customer: "cus_1", subscription: "sub_1", amount_paid: 1000, currency: "eur", lines: { data: [line] }, ...invoice }, "evt_p"));

    beforeEach(() => getUserByStripeSubscriptionId.mockResolvedValue(knownUser));

    test("extends the membership to the end of the paid period", async () => {
        await paid();

        expect(lastUpdate()).toEqual({
            userId: userId.toString(),
            stripeCustomerId: "cus_1",
            stripeSubscriptionId: "sub_1",
            stripePriceId: "price_a",
            status: "active",
            membershipState: "active",
            membershipSource: "stripe",
            membershipExpiresAt: new Date(FUTURE_S * 1000),
            stripeCurrentPeriodEnd: new Date(FUTURE_S * 1000),
            amount: 10,
            currency: "eur",
            interval: "month",
            lastPaymentDate: NOW,
            lastWebhookEventId: "evt_p",
        });
    });

    test("converts the amount from cents", async () => {
        await paid({ amount_paid: 2550 });

        expect(lastUpdate().amount).toBe(25.5);
    });

    test("keeps a zero amount but omits a missing one", async () => {
        await paid({ amount_paid: 0 });
        expect(lastUpdate().amount).toBe(0);

        applyStripeMembershipUpdate.mockClear();
        await paid({ amount_paid: undefined });
        expect(lastUpdate().amount).toBeUndefined();
    });

    test("reads the price from the legacy line shape when the new one is absent", async () => {
        await paid({ lines: { data: [{ period: { end: FUTURE_S }, price: { id: "price_legacy", recurring: { interval: "year" } } }] } });

        expect(lastUpdate()).toMatchObject({ stripePriceId: "price_legacy", interval: "year" });
    });

    test("copes with an invoice without lines", async () => {
        await paid({ lines: { data: [] } });

        expect(lastUpdate()).toMatchObject({ status: "active", membershipState: "active" });
        expect(lastUpdate().membershipExpiresAt).toBeUndefined();
        expect(lastUpdate().stripePriceId).toBeUndefined();
        expect(lastUpdate().interval).toBeUndefined();
    });

    test("only accepts monthly and yearly intervals", async () => {
        await paid({ lines: { data: [{ pricing: { price_details: { price: { id: "p", recurring: { interval: "week" } } } } }] } });

        expect(lastUpdate().interval).toBeUndefined();
    });

    test("omits the currency when the invoice has none", async () => {
        await paid({ currency: "" });

        expect(lastUpdate().currency).toBeUndefined();
    });
});

describe("invoice.payment_failed", () => {
    const failed = (invoice: Record<string, unknown> = {}) =>
        send(event("invoice.payment_failed", { customer: "cus_1", subscription: "sub_1", ...invoice }, "evt_f"));
    const userExpiring = (subscription: Record<string, unknown>) => getUserByStripeSubscriptionId.mockResolvedValue({ _id: userId, subscription });

    test("moves a member whose paid period has not ended into a grace period until it does", async () => {
        const expires = new Date(FUTURE_S * 1000);
        userExpiring({ membershipExpiresAt: expires });

        await failed();

        expect(lastUpdate()).toEqual({
            userId: userId.toString(),
            stripeCustomerId: "cus_1",
            stripeSubscriptionId: "sub_1",
            status: "past_due",
            membershipState: "grace_period",
            membershipSource: "stripe",
            membershipExpiresAt: expires,
            membershipGraceUntil: expires,
            lastWebhookEventId: "evt_f",
        });
    });

    test("marks a member whose paid period already ended as past due", async () => {
        userExpiring({ membershipExpiresAt: new Date(PAST_S * 1000) });

        await failed();

        expect(lastUpdate()).toMatchObject({ status: "past_due", membershipState: "past_due" });
    });

    test("uses the first available of membership expiry, current period end and end date", async () => {
        userExpiring({ stripeCurrentPeriodEnd: new Date(FUTURE_S * 1000), endsAt: new Date(PAST_S * 1000) });
        await failed();
        expect(lastUpdate().membershipState).toBe("grace_period");

        applyStripeMembershipUpdate.mockClear();
        userExpiring({ endsAt: new Date(FUTURE_S * 1000) });
        await failed();
        expect(lastUpdate().membershipState).toBe("grace_period");
    });

    test("marks a member with no known expiry as past due without dates", async () => {
        userExpiring({});

        await failed();

        expect(lastUpdate()).toMatchObject({ status: "past_due", membershipState: "past_due" });
        expect(lastUpdate().membershipExpiresAt).toBeUndefined();
        expect(lastUpdate().membershipGraceUntil).toBeUndefined();
    });

    test("handles a user without subscription details", async () => {
        getUserByStripeSubscriptionId.mockResolvedValue({ _id: userId });

        await failed();

        expect(lastUpdate().membershipState).toBe("past_due");
    });
});

describe("customer.subscription.created and updated", () => {
    const subscription = (overrides: Record<string, unknown> = {}) => ({
        id: "sub_1",
        customer: "cus_1",
        status: "active",
        cancel_at_period_end: false,
        current_period_end: FUTURE_S,
        start_date: 1_700_000_000,
        items: { data: [{ price: { id: "price_a", unit_amount: 500, currency: "eur", recurring: { interval: "month" } } }] },
        ...overrides,
    });
    const upsert = (overrides: Record<string, unknown> = {}, type = "customer.subscription.updated") =>
        send(event(type, subscription(overrides), "evt_s"));

    beforeEach(() => getUserByStripeSubscriptionId.mockResolvedValue(knownUser));

    test("mirrors an active subscription", async () => {
        await upsert();

        expect(lastUpdate()).toEqual({
            userId: userId.toString(),
            stripeCustomerId: "cus_1",
            stripeSubscriptionId: "sub_1",
            stripePriceId: "price_a",
            status: "active",
            membershipState: "active",
            membershipSource: "stripe",
            membershipExpiresAt: new Date(FUTURE_S * 1000),
            stripeCurrentPeriodEnd: new Date(FUTURE_S * 1000),
            cancelAtPeriodEnd: false,
            amount: 5,
            currency: "eur",
            interval: "month",
            startDate: new Date(1_700_000_000 * 1000),
            lastWebhookEventId: "evt_s",
        });
    });

    test.each(["customer.subscription.created", "customer.subscription.updated"])("handles %s the same way", async (type) => {
        await upsert({}, type);

        expect(lastUpdate().membershipState).toBe("active");
    });

    test.each([
        ["active", FUTURE_S, "active", "active"],
        ["trialing", FUTURE_S, "trialing", "active"],
        ["past_due", FUTURE_S, "past_due", "grace_period"],
        ["past_due", PAST_S, "past_due", "past_due"],
        ["past_due", null, "past_due", "past_due"],
        ["unpaid", FUTURE_S, "unpaid", "unpaid"],
        ["canceled", FUTURE_S, "cancelled", "grace_period"],
        ["canceled", PAST_S, "cancelled", "cancelled"],
        ["incomplete", FUTURE_S, "inactive", "inactive"],
        ["incomplete_expired", FUTURE_S, "inactive", "inactive"],
        ["paused", FUTURE_S, "inactive", "inactive"],
    ])("maps the Stripe status %s (period end %p) to status %s and membership state %s", async (stripeStatus, periodEnd, status, membershipState) => {
        await upsert({ status: stripeStatus, current_period_end: periodEnd });

        expect(lastUpdate()).toMatchObject({ status, membershipState });
    });

    test("passes on a pending cancellation", async () => {
        await upsert({ cancel_at_period_end: true });

        expect(lastUpdate().cancelAtPeriodEnd).toBe(true);
    });

    test("copes with a subscription without items or dates", async () => {
        await upsert({ items: { data: [] }, current_period_end: undefined, start_date: undefined });

        expect(lastUpdate().stripePriceId).toBeUndefined();
        expect(lastUpdate().amount).toBeUndefined();
        expect(lastUpdate().currency).toBeUndefined();
        expect(lastUpdate().interval).toBeUndefined();
        expect(lastUpdate().membershipExpiresAt).toBeUndefined();
        expect(lastUpdate().startDate).toBeUndefined();
    });

    test("keeps a zero price amount", async () => {
        await upsert({ items: { data: [{ price: { id: "free", unit_amount: 0, recurring: { interval: "year" } } }] } });

        expect(lastUpdate()).toMatchObject({ amount: 0, interval: "year" });
    });

    test("warns with the event type when the user cannot be found", async () => {
        getUserByStripeSubscriptionId.mockResolvedValue(null);

        await upsert({}, "customer.subscription.created");

        expect(consoleSpy.warn).toHaveBeenCalledWith("customer.subscription.created: user not found");
        expect(applyStripeMembershipUpdate).not.toHaveBeenCalled();
    });
});

describe("customer.subscription.deleted", () => {
    const deleted = (overrides: Record<string, unknown> = {}) =>
        send(event("customer.subscription.deleted", { id: "sub_1", customer: "cus_1", current_period_end: FUTURE_S, ...overrides }, "evt_d"));

    beforeEach(() => getUserByStripeSubscriptionId.mockResolvedValue(knownUser));

    test("keeps access until the paid period ends", async () => {
        await deleted();

        expect(lastUpdate()).toEqual({
            userId: userId.toString(),
            stripeCustomerId: "cus_1",
            stripeSubscriptionId: "sub_1",
            status: "cancelled",
            membershipState: "grace_period",
            membershipSource: "stripe",
            membershipExpiresAt: new Date(FUTURE_S * 1000),
            membershipGraceUntil: new Date(FUTURE_S * 1000),
            stripeCurrentPeriodEnd: new Date(FUTURE_S * 1000),
            cancelAtPeriodEnd: true,
            lastWebhookEventId: "evt_d",
        });
    });

    test("ends the membership when the paid period is over", async () => {
        await deleted({ current_period_end: PAST_S });

        expect(lastUpdate()).toMatchObject({ status: "cancelled", membershipState: "cancelled", cancelAtPeriodEnd: true });
        expect(lastUpdate().membershipGraceUntil).toBeUndefined();
    });

    test("ends the membership when no period end is known", async () => {
        await deleted({ current_period_end: undefined });

        expect(lastUpdate().membershipState).toBe("cancelled");
    });
});

describe("failures", () => {
    test("reports a handler failure with its message", async () => {
        getUserByStripeCustomerId.mockResolvedValue(knownUser);
        applyStripeMembershipUpdate.mockRejectedValue(new Error("db down"));

        const response = await send(event("invoice.paid", { customer: "cus_1", lines: { data: [] } }));

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: "db down" });
        expect(consoleSpy.error).toHaveBeenCalledWith("Stripe webhook error:", expect.any(Error));
    });

    test("uses a generic message when the failure is not an Error", async () => {
        markStripeWebhookEventProcessed.mockRejectedValue("boom");

        expect(await (await send(event("invoice.paid", {}))).json()).toEqual({ error: "Webhook handler failed" });
    });
});
