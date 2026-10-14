import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import type { Circle } from "@/models/models";
import { toSettingsNavigationDto, type SettingsNavigationDto } from "./settings-navigation-dto";

if (false) {
    const rawCircle = {} as Circle;
    // @ts-expect-error A raw Circle must not be assignable to the opaque navigation DTO.
    const navigation: SettingsNavigationDto = rawCircle;
    void navigation;
}

test("settings navigation boundary copies only handle and circleType", () => {
    const rawCircle = {
        handle: "safe-handle",
        circleType: "user",
        location: {
            precision: 4,
            street: "PRIVATE_STREET",
            lngLat: { lng: 18.0686, lat: 59.3293 },
            coordinates: [18.0686, 59.3293],
        },
        matrixAccessToken: "PRIVATE_MATRIX_ACCESS_TOKEN",
        matrixPassword: "PRIVATE_MATRIX_PASSWORD",
        metadata: { secret: "PRIVATE_METADATA" },
        passwordResetToken: "PRIVATE_PASSWORD_RESET_TOKEN",
        passwordResetTokenExpiry: new Date("2026-01-01T00:00:00.000Z"),
        emailVerificationToken: "PRIVATE_EMAIL_VERIFICATION_TOKEN",
        emailVerificationTokenExpiry: new Date("2026-01-01T00:00:00.000Z"),
        emailVerificationLastSentAt: new Date("2026-01-01T00:00:00.000Z"),
        subscription: {
            provider: "stripe",
            customerId: "PRIVATE_CUSTOMER_ID",
            paymentMethodId: "PRIVATE_PAYMENT_METHOD_ID",
            donorboxPlanId: "PRIVATE_DONORBOX_PLAN_ID",
            donorboxSubscriptionId: "PRIVATE_DONORBOX_SUBSCRIPTION_ID",
            donorboxDonationId: "PRIVATE_DONORBOX_DONATION_ID",
            donorboxDonorId: "PRIVATE_DONORBOX_DONOR_ID",
            stripeCustomerId: "PRIVATE_STRIPE_CUSTOMER_ID",
            stripeSubscriptionId: "PRIVATE_STRIPE_SUBSCRIPTION_ID",
            stripePriceId: "PRIVATE_STRIPE_PRICE_ID",
            stripeCheckoutSessionId: "PRIVATE_STRIPE_CHECKOUT_SESSION_ID",
        },
    } as unknown as Circle;

    const navigation = toSettingsNavigationDto(rawCircle);

    assert.notEqual(navigation, rawCircle);
    assert.deepEqual(navigation, { handle: "safe-handle", circleType: "user" });
    assert.deepEqual(Object.keys(navigation).sort(), ["circleType", "handle"]);

    const serialized = JSON.stringify(navigation);
    for (const forbidden of [
        "location",
        "street",
        "lngLat",
        "coordinates",
        "matrixAccessToken",
        "matrixPassword",
        "metadata",
        "passwordResetToken",
        "passwordResetTokenExpiry",
        "emailVerificationToken",
        "emailVerificationTokenExpiry",
        "emailVerificationLastSentAt",
        "subscription",
        "provider",
        "customerId",
        "paymentMethodId",
        "donorboxPlanId",
        "donorboxSubscriptionId",
        "donorboxDonationId",
        "donorboxDonorId",
        "stripeCustomerId",
        "stripeSubscriptionId",
        "stripePriceId",
        "stripeCheckoutSessionId",
    ]) {
        assert.equal(serialized.includes(forbidden), false, `settings navigation DTO contained ${forbidden}`);
    }
});

test("settings layout constructs and passes the settings navigation DTO", () => {
    const root = process.cwd();
    const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");
    const layout = read("src/app/circles/[handle]/settings/layout.tsx");
    const wrapper = read("src/app/circles/[handle]/settings/settings-layout-wrapper.tsx");

    assert.match(layout, /const navigation = toSettingsNavigationDto\(circle\)/);
    assert.match(layout, /<SettingsLayoutWrapper navigation=\{navigation\}>/);
    assert.doesNotMatch(layout, /<SettingsLayoutWrapper circle=\{circle\}>/);
    assert.match(wrapper, /<FormNav items=\{navItems\} handle=\{navigation\.handle\} \/>/);
    assert.doesNotMatch(wrapper, /<FormNav items=\{navItems\} circle=/);
});
