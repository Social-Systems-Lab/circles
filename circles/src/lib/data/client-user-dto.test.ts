import assert from "node:assert/strict";
import type { UserPrivate } from "@/models/models";
import { toAuthenticatedClientUser, toBookmarkStateDto, toGuidelineStateDto, toPinStateDto } from "./client-user-dto";

const privateSentinels = [
    "PRIVATE_PUBLIC_KEY",
    "PRIVATE_EMAIL",
    "PRIVATE_OFFICIAL_EMAIL",
    "PRIVATE_MATRIX_URL",
    "PRIVATE_MATRIX_NAME",
    "PRIVATE_MATRIX_ACCESS_TOKEN",
    "PRIVATE_MATRIX_USERNAME",
    "PRIVATE_MATRIX_PASSWORD",
    "PRIVATE_MATRIX_NOTIFICATIONS_ROOM",
    "PRIVATE_RESET_TOKEN",
    "PRIVATE_RESET_EXPIRY",
    "PRIVATE_VERIFIED_AT",
    "PRIVATE_VERIFIED_BY",
    "PRIVATE_VERIFICATION_TOKEN",
    "PRIVATE_VERIFICATION_EXPIRY",
    "PRIVATE_VERIFICATION_LAST_SENT",
    "PRIVATE_PROVIDER",
    "PRIVATE_DONORBOX_PLAN_ID",
    "PRIVATE_DONORBOX_SUBSCRIPTION_ID",
    "PRIVATE_DONORBOX_DONATION_ID",
    "PRIVATE_DONORBOX_DONOR_ID",
    "PRIVATE_STRIPE_CUSTOMER_ID",
    "PRIVATE_STRIPE_SUBSCRIPTION_ID",
    "PRIVATE_STRIPE_PRICE_ID",
    "PRIVATE_STRIPE_CHECKOUT_SESSION_ID",
    "PRIVATE_WEBHOOK_EVENT_ID",
    "PRIVATE_SUBSCRIPTION_STATUS",
    "PRIVATE_MEMBERSHIP_STATE",
    "PRIVATE_MEMBERSHIP_SOURCE",
    "PRIVATE_SUBSCRIPTION_ENDS_AT",
    "PRIVATE_MEMBERSHIP_EXPIRES_AT",
    "PRIVATE_MEMBERSHIP_GRACE_UNTIL",
    "PRIVATE_STRIPE_PERIOD_END",
    "PRIVATE_CANCEL_AT_PERIOD_END",
    "PRIVATE_SUBSCRIPTION_AMOUNT",
    "PRIVATE_SUBSCRIPTION_CURRENCY",
    "PRIVATE_SUBSCRIPTION_INTERVAL",
    "PRIVATE_SUBSCRIPTION_START_DATE",
    "PRIVATE_LAST_PAYMENT_DATE",
    "PRIVATE_METADATA",
    "PRIVATE_DONATION_INTENT",
    "PRIVATE_STREET",
    "PRIVATE_COORDINATES",
    "PRIVATE_NESTED_CIRCLE_ID",
    "PRIVATE_NESTED_CIRCLE_PICTURE",
    "PRIVATE_NESTED_CIRCLE",
    "PRIVATE_PENDING_REQUEST",
    "PRIVATE_CHAT_ROOM_ID",
    "PRIVATE_CHAT_MEMBERSHIP",
    "PRIVATE_NOTIFICATION_BACKEND",
    "PRIVATE_GUIDELINE_EXTRA",
    "PRIVATE_GUIDELINE_RULE",
    "PRIVATE_FUTURE_RECOVERY_SECRET",
];

const rawUser = {
    _id: "user-id",
    did: "did:example:owner",
    publicKey: "PRIVATE_PUBLIC_KEY",
    name: "Safe Name",
    handle: "safe-handle",
    picture: { url: "https://example.test/safe.png" },
    description: "Safe description",
    isAdmin: true,
    isEmailVerified: true,
    isVerified: true,
    isHuman: true,
    isMember: true,
    manualMember: true,
    isFoundingMember: true,
    verificationStatus: "verified",
    accountStatus: "active",
    email: "PRIVATE_EMAIL",
    officialEmail: "PRIVATE_OFFICIAL_EMAIL",
    matrixUrl: "PRIVATE_MATRIX_URL",
    fullMatrixName: "PRIVATE_MATRIX_NAME",
    matrixAccessToken: "PRIVATE_MATRIX_ACCESS_TOKEN",
    matrixUsername: "PRIVATE_MATRIX_USERNAME",
    matrixPassword: "PRIVATE_MATRIX_PASSWORD",
    matrixNotificationsRoomId: "PRIVATE_MATRIX_NOTIFICATIONS_ROOM",
    passwordResetToken: "PRIVATE_RESET_TOKEN",
    passwordResetTokenExpiry: "PRIVATE_RESET_EXPIRY",
    emailVerificationToken: "PRIVATE_VERIFICATION_TOKEN",
    emailVerificationTokenExpiry: "PRIVATE_VERIFICATION_EXPIRY",
    emailVerificationLastSentAt: "PRIVATE_VERIFICATION_LAST_SENT",
    verifiedAt: "PRIVATE_VERIFIED_AT",
    verifiedBy: "PRIVATE_VERIFIED_BY",
    subscription: {
        provider: "PRIVATE_PROVIDER",
        donorboxPlanId: "PRIVATE_DONORBOX_PLAN_ID",
        donorboxSubscriptionId: "PRIVATE_DONORBOX_SUBSCRIPTION_ID",
        donorboxDonationId: "PRIVATE_DONORBOX_DONATION_ID",
        donorboxDonorId: "PRIVATE_DONORBOX_DONOR_ID",
        stripeCustomerId: "PRIVATE_STRIPE_CUSTOMER_ID",
        stripeSubscriptionId: "PRIVATE_STRIPE_SUBSCRIPTION_ID",
        stripePriceId: "PRIVATE_STRIPE_PRICE_ID",
        stripeCheckoutSessionId: "PRIVATE_STRIPE_CHECKOUT_SESSION_ID",
        status: "PRIVATE_SUBSCRIPTION_STATUS",
        membershipState: "PRIVATE_MEMBERSHIP_STATE",
        membershipSource: "PRIVATE_MEMBERSHIP_SOURCE",
        endsAt: "PRIVATE_SUBSCRIPTION_ENDS_AT",
        membershipExpiresAt: "PRIVATE_MEMBERSHIP_EXPIRES_AT",
        membershipGraceUntil: "PRIVATE_MEMBERSHIP_GRACE_UNTIL",
        stripeCurrentPeriodEnd: "PRIVATE_STRIPE_PERIOD_END",
        cancelAtPeriodEnd: { marker: "PRIVATE_CANCEL_AT_PERIOD_END" },
        amount: { marker: "PRIVATE_SUBSCRIPTION_AMOUNT" },
        currency: "PRIVATE_SUBSCRIPTION_CURRENCY",
        interval: "PRIVATE_SUBSCRIPTION_INTERVAL",
        startDate: "PRIVATE_SUBSCRIPTION_START_DATE",
        lastPaymentDate: "PRIVATE_LAST_PAYMENT_DATE",
        lastWebhookEventId: "PRIVATE_WEBHOOK_EVENT_ID",
    },
    donationIntent: { marker: "PRIVATE_DONATION_INTENT" },
    metadata: { onboardingFlow: "v2-signup", secret: "PRIVATE_METADATA" },
    location: {
        precision: 7,
        country: "Sweden",
        region: "Stockholm",
        city: "Stockholm",
        street: "PRIVATE_STREET",
        lngLat: { lng: 18.0686, lat: 59.3293, marker: "PRIVATE_COORDINATES" },
    },
    memberships: [
        {
            circleId: "circle-id",
            userGroups: ["members"],
            joinedAt: new Date("2026-01-01T00:00:00.000Z"),
            questionnaireAnswers: { secret: "PRIVATE_NESTED_CIRCLE" },
            circle: {
                _id: { toString: () => "circle-id", privateSentinel: "PRIVATE_NESTED_CIRCLE_ID" },
                name: "Safe Circle",
                handle: "safe-circle",
                picture: {
                    url: "https://example.test/circle.png",
                    originalName: "circle.png",
                    fileName: "stored-circle.png",
                    privateSentinel: "PRIVATE_NESTED_CIRCLE_PICTURE",
                },
                email: "PRIVATE_NESTED_CIRCLE",
                metadata: { secret: "PRIVATE_NESTED_CIRCLE" },
            },
        },
    ],
    friends: [
        {
            circleId: "friend-id",
            userGroups: ["members"],
            joinedAt: new Date(),
            circle: { email: "PRIVATE_NESTED_CIRCLE" },
        },
    ],
    pendingRequests: [
        {
            userDid: "did:example:owner",
            circleId: "pending-circle-id",
            status: "pending",
            requestedAt: new Date("2026-01-02T00:00:00.000Z"),
            email: "PRIVATE_PENDING_REQUEST",
            questionnaireAnswers: { secret: "PRIVATE_PENDING_REQUEST" },
        },
    ],
    chatRoomMemberships: [
        {
            userDid: "did:example:owner",
            chatRoomId: "chat-id",
            joinedAt: new Date("2026-01-03T00:00:00.000Z"),
            role: "admin",
            chatRoom: {
                _id: { toString: () => "chat-id", privateSentinel: "PRIVATE_CHAT_ROOM_ID" },
                name: "Safe Chat",
                handle: "safe-chat",
                createdAt: new Date("2026-01-03T00:00:00.000Z"),
                userGroups: ["members"],
                metadata: { secret: "PRIVATE_CHAT_MEMBERSHIP" },
                circle: { email: "PRIVATE_CHAT_MEMBERSHIP" },
            },
        },
    ],
    notificationSettings: {
        CIRCLE: {
            "circle-id": {
                TASKS_ALL: {
                    isEnabled: true,
                    isConfigurable: false,
                    backendRoute: "PRIVATE_NOTIFICATION_BACKEND",
                },
            },
        },
    },
    bookmarkedCircles: ["bookmark-id"],
    pinnedCircles: ["pin-id"],
    communityGuidelinesAcceptance: {
        truth: {
            accepted: true,
            acceptedAt: new Date("2026-01-04T00:00:00.000Z"),
            privateSentinel: "PRIVATE_GUIDELINE_RULE",
        },
        constructive: { accepted: true, acceptedAt: new Date("2026-01-04T00:00:00.000Z") },
        respect: { accepted: true, acceptedAt: new Date("2026-01-04T00:00:00.000Z") },
        privacy: { accepted: true, acceptedAt: new Date("2026-01-04T00:00:00.000Z") },
        responsibility: { accepted: true, acceptedAt: new Date("2026-01-04T00:00:00.000Z") },
        extraPrivateField: "PRIVATE_GUIDELINE_EXTRA",
    },
    communityGuidelinesAcceptedAt: new Date("2026-01-04T00:00:00.000Z"),
    futureRecoverySecret: "PRIVATE_FUTURE_RECOVERY_SECRET",
} as unknown as UserPrivate;

const serializedRawUser = JSON.stringify(rawUser);
for (const sentinel of privateSentinels) {
    assert.equal(serializedRawUser.includes(sentinel), true, `${sentinel} must exist in the raw fixture`);
}

const clientUser = toAuthenticatedClientUser(rawUser);
const serialized = JSON.stringify(clientUser);

for (const sentinel of privateSentinels) {
    assert.equal(serialized.includes(sentinel), false, `${sentinel} must not cross the browser boundary`);
}

const sensitivePropertyNames = new Set([
    "publicKey",
    "email",
    "officialEmail",
    "matrixUrl",
    "fullMatrixName",
    "matrixAccessToken",
    "matrixUsername",
    "matrixPassword",
    "matrixNotificationsRoomId",
    "passwordResetToken",
    "passwordResetTokenExpiry",
    "emailVerificationToken",
    "emailVerificationTokenExpiry",
    "emailVerificationLastSentAt",
    "verifiedAt",
    "verifiedBy",
    "subscription",
    "provider",
    "donorboxPlanId",
    "donorboxSubscriptionId",
    "donorboxDonationId",
    "donorboxDonorId",
    "stripeCustomerId",
    "stripeSubscriptionId",
    "stripePriceId",
    "stripeCheckoutSessionId",
    "membershipState",
    "membershipSource",
    "endsAt",
    "membershipExpiresAt",
    "membershipGraceUntil",
    "stripeCurrentPeriodEnd",
    "cancelAtPeriodEnd",
    "amount",
    "currency",
    "interval",
    "startDate",
    "lastPaymentDate",
    "lastWebhookEventId",
    "donationIntent",
    "street",
    "lngLat",
    "metadata",
    "futureRecoverySecret",
]);

const assertSensitivePropertyNamesAbsent = (value: unknown, path = "clientUser"): void => {
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
        assert.equal(sensitivePropertyNames.has(key), false, `${path}.${key} must not cross the browser boundary`);
        assertSensitivePropertyNamesAbsent(child, `${path}.${key}`);
    }
};

assertSensitivePropertyNamesAbsent(clientUser);

assert.equal(clientUser.did, "did:example:owner");
assert.equal(clientUser.name, "Safe Name");
assert.equal(clientUser.handle, "safe-handle");
assert.equal(clientUser.isAdmin, true);
assert.equal(clientUser.isEmailVerified, true);
assert.equal(clientUser.onboardingFlow, "v2-signup");
assert.equal(clientUser.isVerified, true);
assert.equal(clientUser.isHuman, true);
assert.equal(clientUser.isMember, true);
assert.equal(clientUser.manualMember, true);
assert.equal(clientUser.isFoundingMember, true);
assert.equal(clientUser.verificationStatus, "verified");
assert.equal(clientUser.accountStatus, "active");
assert.deepEqual(clientUser.location, {
    precision: 7,
    country: "Sweden",
    region: "Stockholm",
    city: "Stockholm",
});
assert.deepEqual(clientUser.memberships[0], {
    circleId: "circle-id",
    userGroups: ["members"],
    joinedAt: new Date("2026-01-01T00:00:00.000Z"),
    circle: {
        _id: "circle-id",
        did: undefined,
        name: "Safe Circle",
        handle: "safe-circle",
        picture: {
            url: "https://example.test/circle.png",
            originalName: "circle.png",
            fileName: "stored-circle.png",
        },
        circleType: undefined,
        description: undefined,
        mission: undefined,
    },
});
assert.deepEqual(clientUser.pendingRequests[0], {
    userDid: "did:example:owner",
    circleId: "pending-circle-id",
    status: "pending",
    requestedAt: new Date("2026-01-02T00:00:00.000Z"),
});
assert.deepEqual(clientUser.chatRoomMemberships[0], {
    userDid: "did:example:owner",
    chatRoomId: "chat-id",
    joinedAt: new Date("2026-01-03T00:00:00.000Z"),
    role: "admin",
    chatRoom: {
        _id: "chat-id",
        name: "Safe Chat",
        handle: "safe-chat",
        createdAt: new Date("2026-01-03T00:00:00.000Z"),
        userGroups: ["members"],
    },
});
assert.deepEqual(clientUser.notificationSettings?.CIRCLE?.["circle-id"]?.TASKS_ALL, {
    isEnabled: true,
    isConfigurable: false,
});
assert.deepEqual(clientUser.communityGuidelinesAcceptance, {
    truth: { accepted: true, acceptedAt: new Date("2026-01-04T00:00:00.000Z") },
    constructive: { accepted: true, acceptedAt: new Date("2026-01-04T00:00:00.000Z") },
    respect: { accepted: true, acceptedAt: new Date("2026-01-04T00:00:00.000Z") },
    privacy: { accepted: true, acceptedAt: new Date("2026-01-04T00:00:00.000Z") },
    responsibility: { accepted: true, acceptedAt: new Date("2026-01-04T00:00:00.000Z") },
});

assert.deepEqual(toBookmarkStateDto(rawUser), { bookmarkedCircles: ["bookmark-id"] });
assert.deepEqual(toPinStateDto(rawUser), {
    pinnedCircles: ["pin-id"],
    bookmarkedCircles: ["bookmark-id"],
});
assert.deepEqual(Object.keys(toGuidelineStateDto(rawUser)).sort(), [
    "communityGuidelinesAcceptance",
    "communityGuidelinesAcceptedAt",
]);
assert.equal(JSON.stringify(toGuidelineStateDto(rawUser)).includes("PRIVATE_GUIDELINE"), false);

console.log("client-user DTO privacy tests passed");
