import { beforeEach, describe, expect, mock, setSystemTime, test } from "bun:test";
import { ObjectId } from "mongodb";
import { useFakeNow } from "@/test/hooks";
import { mockDb } from "@/test/mock-db";

const db = mockDb();

const getPrivateUserByDid = mock(async (_did: string): Promise<Record<string, any> | null> => null);
mock.module("@/lib/data/user", () => ({ getPrivateUserByDid }));

const createCustomer = mock(async (_params: Record<string, any>) => ({ id: "cus_new" }));
mock.module("@/lib/stripe", () => ({ getStripe: () => ({ customers: { create: createCustomer } }) }));

const membership = await import("./membership");

const NOW = new Date("2026-06-15T12:00:00.000Z");
useFakeNow(NOW);
const FUTURE = new Date("2026-07-15T12:00:00.000Z");

const seedUser = (overrides: Record<string, unknown> = {}) => {
    const _id = new ObjectId();
    db.Circles.docs.push({ _id, did: "did:user", circleType: "user", email: "vee@example.com", name: "Vee", handle: "vee", ...overrides });
    return _id;
};
const stored = (id: ObjectId) => db.Circles.byId(id)!;

beforeEach(() => {
    db.Circles.docs = [];
    db.StripeWebhookEvents.docs = [];
    getPrivateUserByDid.mockReset();
    getPrivateUserByDid.mockResolvedValue(null);
    createCustomer.mockClear();
});

describe("lookups", () => {
    test("getUserByStripeCustomerId finds the user profile with that customer", async () => {
        seedUser({ subscription: { stripeCustomerId: "cus_1" } });

        expect(await membership.getUserByStripeCustomerId("cus_1")).toMatchObject({ did: "did:user" });
        expect(await membership.getUserByStripeCustomerId("cus_other")).toBeNull();
    });

    test("getUserByStripeSubscriptionId finds the user profile with that subscription", async () => {
        seedUser({ subscription: { stripeSubscriptionId: "sub_1" } });

        expect(await membership.getUserByStripeSubscriptionId("sub_1")).toMatchObject({ did: "did:user" });
        expect(await membership.getUserByStripeSubscriptionId("sub_other")).toBeNull();
    });

    test("getUserByEmail finds the user profile with that email", async () => {
        seedUser();

        expect(await membership.getUserByEmail("vee@example.com")).toMatchObject({ did: "did:user" });
        expect(await membership.getUserByEmail("nobody@example.com")).toBeNull();
    });

    test("only ever return personal profiles", async () => {
        db.Circles.docs.push({
            _id: new ObjectId(),
            circleType: "circle",
            email: "vee@example.com",
            subscription: { stripeCustomerId: "cus_1", stripeSubscriptionId: "sub_1" },
        });

        expect(await membership.getUserByStripeCustomerId("cus_1")).toBeNull();
        expect(await membership.getUserByStripeSubscriptionId("sub_1")).toBeNull();
        expect(await membership.getUserByEmail("vee@example.com")).toBeNull();
    });
});

describe("applyStripeMembershipUpdate", () => {
    const update = (userId: ObjectId, overrides: Record<string, unknown> = {}) =>
        membership.applyStripeMembershipUpdate({ userId: userId.toString(), membershipState: "active", ...overrides } as never);

    describe("membership states", () => {
        test.each(["active", "grace_period"] as const)("makes the user a verified, active member in the %s state", async (membershipState) => {
            const id = seedUser({ accountStatus: "pending_verification" });

            await update(id, { membershipState });

            expect(stored(id)).toMatchObject({
                isMember: true,
                isVerified: true,
                accountStatus: "active",
                subscription: { provider: "stripe", membershipState },
            });
        });

        test.each(["inactive", "cancelled", "past_due", "unpaid"] as const)("removes membership in the %s state", async (membershipState) => {
            const id = seedUser({ isMember: true, isVerified: true, accountStatus: "active" });

            await update(id, { membershipState });

            expect(stored(id)).toMatchObject({ isMember: false, isVerified: false, subscription: { membershipState } });
        });

        test("does not change the account status when membership ends", async () => {
            const id = seedUser({ accountStatus: "active" });

            await update(id, { membershipState: "cancelled" });

            expect(stored(id).accountStatus).toBe("active");
        });

        test("does not activate an account that has no membership", async () => {
            const id = seedUser({ accountStatus: "pending_verification" });

            await update(id, { membershipState: "unpaid" });

            expect(stored(id).accountStatus).toBe("pending_verification");
            expect(stored(id).verifiedAt).toBeUndefined();
        });
    });

    describe("verification record", () => {
        test("stamps the payment as the verifier for an account that was not active yet", async () => {
            const id = seedUser({ accountStatus: "pending_verification" });

            await update(id);

            expect(stored(id)).toMatchObject({ verifiedAt: NOW, verifiedBy: "system:payment" });
        });

        test("does not overwrite the verification of an account that was already active", async () => {
            const verifiedAt = new Date("2026-01-01T00:00:00.000Z");
            const id = seedUser({ accountStatus: "active", verifiedAt, verifiedBy: "did:admin" });

            await update(id);

            expect(stored(id)).toMatchObject({ verifiedAt, verifiedBy: "did:admin" });
        });
    });

    describe("subscription details", () => {
        test("defaults the source to stripe", async () => {
            const id = seedUser();

            await update(id);

            expect(stored(id).subscription.membershipSource).toBe("stripe");
        });

        test("records an explicit source", async () => {
            const id = seedUser();

            await update(id, { membershipSource: "admin" });

            expect(stored(id).subscription.membershipSource).toBe("admin");
        });

        test("stores every detail that is provided", async () => {
            const id = seedUser();

            await update(id, {
                stripeCustomerId: "cus_1",
                stripeSubscriptionId: "sub_1",
                stripePriceId: "price_1",
                stripeCheckoutSessionId: "cs_1",
                status: "active",
                membershipExpiresAt: FUTURE,
                membershipGraceUntil: FUTURE,
                stripeCurrentPeriodEnd: FUTURE,
                cancelAtPeriodEnd: true,
                amount: 5,
                currency: "eur",
                interval: "month",
                startDate: NOW,
                lastPaymentDate: NOW,
                lastWebhookEventId: "evt_1",
            });

            expect(stored(id).subscription).toEqual({
                provider: "stripe",
                membershipState: "active",
                membershipSource: "stripe",
                stripeCustomerId: "cus_1",
                stripeSubscriptionId: "sub_1",
                stripePriceId: "price_1",
                stripeCheckoutSessionId: "cs_1",
                status: "active",
                membershipExpiresAt: FUTURE,
                membershipGraceUntil: FUTURE,
                stripeCurrentPeriodEnd: FUTURE,
                cancelAtPeriodEnd: true,
                amount: 5,
                currency: "eur",
                interval: "month",
                startDate: NOW,
                lastPaymentDate: NOW,
                lastWebhookEventId: "evt_1",
            });
        });

        test("leaves details that were not provided as they were", async () => {
            const id = seedUser({ subscription: { stripeCustomerId: "cus_1", amount: 5, interval: "year" } });

            await update(id, { stripeSubscriptionId: "sub_2" });

            expect(stored(id).subscription).toMatchObject({ stripeCustomerId: "cus_1", amount: 5, interval: "year", stripeSubscriptionId: "sub_2" });
        });

        test("stores falsy values such as a zero amount or a false flag", async () => {
            const id = seedUser({ subscription: { amount: 5, cancelAtPeriodEnd: true } });

            await update(id, { amount: 0, cancelAtPeriodEnd: false });

            expect(stored(id).subscription).toMatchObject({ amount: 0, cancelAtPeriodEnd: false });
        });
    });

    describe("targeting", () => {
        test("only updates the given user", async () => {
            const target = seedUser();
            const other = seedUser({ did: "did:other" });

            await update(target);

            expect(stored(other).isMember).toBeUndefined();
        });

        test("does not update circles that share the id", async () => {
            const id = seedUser({ circleType: "circle" });

            await update(id);

            expect(stored(id).isMember).toBeUndefined();
        });

        test("does nothing for an unknown user", async () => {
            await update(new ObjectId());

            expect(db.Circles.docs).toHaveLength(0);
        });

        test("rejects a user id that is not an ObjectId", async () => {
            await expect(membership.applyStripeMembershipUpdate({ userId: "bogus", membershipState: "active" })).rejects.toThrow();
        });
    });
});

describe("markStripeWebhookEventProcessed", () => {
    test("records a new event and says it should be processed", async () => {
        expect(await membership.markStripeWebhookEventProcessed("evt_1", "invoice.paid")).toBe(true);

        expect(db.StripeWebhookEvents.docs).toHaveLength(1);
        expect(db.StripeWebhookEvents.docs[0]).toMatchObject({ eventId: "evt_1", eventType: "invoice.paid", processedAt: NOW });
    });

    test("says an event that was already recorded should not be processed again", async () => {
        await membership.markStripeWebhookEventProcessed("evt_1", "invoice.paid");
        setSystemTime(new Date(NOW.getTime() + 60_000));

        expect(await membership.markStripeWebhookEventProcessed("evt_1", "invoice.paid")).toBe(false);

        expect(db.StripeWebhookEvents.docs).toHaveLength(1);
        expect(db.StripeWebhookEvents.docs[0].processedAt).toEqual(NOW);
    });

    test("identifies events by id alone, not by type", async () => {
        await membership.markStripeWebhookEventProcessed("evt_1", "invoice.paid");

        expect(await membership.markStripeWebhookEventProcessed("evt_1", "customer.subscription.deleted")).toBe(false);
    });

    test("tracks different events independently", async () => {
        expect(await membership.markStripeWebhookEventProcessed("evt_1", "invoice.paid")).toBe(true);
        expect(await membership.markStripeWebhookEventProcessed("evt_2", "invoice.paid")).toBe(true);
    });
});

describe("findOrCreateStripeCustomerForUser", () => {
    const privateUser = (overrides: Record<string, unknown> = {}) => ({
        _id: "",
        did: "did:user",
        email: "vee@example.com",
        name: "Vee",
        handle: "vee",
        ...overrides,
    });

    test("fails when the user cannot be found", async () => {
        await expect(membership.findOrCreateStripeCustomerForUser("did:user")).rejects.toThrow("User not found");
    });

    test("fails when the user has no id", async () => {
        getPrivateUserByDid.mockResolvedValue({ did: "did:user", email: "vee@example.com" });

        await expect(membership.findOrCreateStripeCustomerForUser("did:user")).rejects.toThrow("User not found");
    });

    test("fails when the user has no email address, without creating a customer", async () => {
        const id = seedUser();
        getPrivateUserByDid.mockResolvedValue(privateUser({ _id: id.toString(), email: undefined }));

        await expect(membership.findOrCreateStripeCustomerForUser("did:user")).rejects.toThrow("User does not have an email address");

        expect(createCustomer).not.toHaveBeenCalled();
    });

    test("reuses the customer the user already has", async () => {
        const id = seedUser();
        const user = privateUser({ _id: id.toString(), subscription: { stripeCustomerId: "cus_existing" } });
        getPrivateUserByDid.mockResolvedValue(user);

        expect(await membership.findOrCreateStripeCustomerForUser("did:user")).toEqual({ user, customerId: "cus_existing" } as never);

        expect(createCustomer).not.toHaveBeenCalled();
    });

    test("creates a Stripe customer for the user and remembers it", async () => {
        const id = seedUser();
        const user = privateUser({ _id: id.toString() });
        getPrivateUserByDid.mockResolvedValue(user);

        const result = await membership.findOrCreateStripeCustomerForUser("did:user");

        expect(result).toEqual({ user, customerId: "cus_new" } as never);
        expect(createCustomer).toHaveBeenCalledWith({
            email: "vee@example.com",
            name: "Vee",
            metadata: { userDid: "did:user", userId: id.toString(), handle: "vee" },
        });
        expect(stored(id).subscription).toEqual({ provider: "stripe", stripeCustomerId: "cus_new", membershipSource: "stripe" });
    });

    test("does not mark the user as a member just for having a customer", async () => {
        const id = seedUser();
        getPrivateUserByDid.mockResolvedValue(privateUser({ _id: id.toString() }));

        await membership.findOrCreateStripeCustomerForUser("did:user");

        expect(stored(id).isMember).toBeUndefined();
    });

    test("sends empty strings for missing profile fields, since Stripe metadata must be strings", async () => {
        const id = seedUser();
        getPrivateUserByDid.mockResolvedValue(privateUser({ _id: id.toString(), did: undefined, handle: undefined, name: undefined }));

        await membership.findOrCreateStripeCustomerForUser("did:user");

        expect(createCustomer.mock.calls[0][0]).toEqual({
            email: "vee@example.com",
            name: undefined,
            metadata: { userDid: "", userId: id.toString(), handle: "" },
        });
    });

    test("does not save anything when Stripe fails", async () => {
        const id = seedUser();
        getPrivateUserByDid.mockResolvedValue(privateUser({ _id: id.toString() }));
        createCustomer.mockRejectedValueOnce(new Error("Stripe down"));

        await expect(membership.findOrCreateStripeCustomerForUser("did:user")).rejects.toThrow("Stripe down");

        expect(stored(id).subscription).toBeUndefined();
    });
});
