import assert from "node:assert/strict";
import { test } from "node:test";
import type { Circle, Metrics } from "@/models/models";
import { buildPinnedCircleDto, buildPublicMapCircleDto } from "./client-circle-dto";
import { applyPublicMapMetricsAndSort } from "./public-map-metrics";

const PRIVATE_SENTINELS = [
    "private-email@sentinel.test",
    "official-email@sentinel.test",
    "private-metadata-sentinel",
    "matrix-credential-sentinel",
    "subscription-sentinel",
    "provider-sentinel",
    "customer-sentinel",
    "payment-sentinel",
];

const makeRawCircle = (
    precision: number,
): Circle & {
    metrics: Metrics;
    mapEligibility: { profileComplete: true };
} =>
    ({
        _id: `circle-${precision}`,
        did: `did:example:${precision}`,
        name: `Circle ${precision}`,
        handle: `circle-${precision}`,
        circleType: precision % 2 === 0 ? "user" : "circle",
        createdAt: new Date("2026-01-02T03:04:05.000Z"),
        location: {
            precision,
            country: "Public Country",
            region: "Public Region",
            city: "Public City",
            street: "Private Street Sentinel",
            lngLat: { lng: 12.345678 + precision, lat: 65.432109 + precision },
        },
        email: PRIVATE_SENTINELS[0],
        officialEmail: PRIVATE_SENTINELS[1],
        metadata: { secret: PRIVATE_SENTINELS[2] },
        matrixAccessToken: PRIVATE_SENTINELS[3],
        subscriptionId: PRIVATE_SENTINELS[4],
        providerAccountId: PRIVATE_SENTINELS[5],
        customerId: PRIVATE_SENTINELS[6],
        paymentMethodId: PRIVATE_SENTINELS[7],
        metrics: {
            rank: 0.2,
            similarity: 0.3,
            distance: 0.4,
            proximity: 0.5,
            recentness: 0.6,
            popularity: 0.7,
        },
        mapEligibility: { profileComplete: true },
    }) as unknown as Circle & { metrics: Metrics; mapEligibility: { profileComplete: true } };

const assertPrivateDataAbsent = (value: unknown) => {
    const serialized = JSON.stringify(value);
    for (const sentinel of PRIVATE_SENTINELS) {
        assert.equal(serialized.includes(sentinel), false, `public payload contained ${sentinel}`);
    }
    for (const field of ["email", "officialEmail", "metadata", "distance", "proximity", "rank"]) {
        assert.equal(serialized.includes(`\"${field}\"`), false, `public payload contained ${field}`);
    }
};

for (const precision of [0, 1, 2, 3, 4]) {
    test(`public map and pins enforce location precision ${precision}`, () => {
        const raw = makeRawCircle(precision);
        const rawCoordinateSentinel = JSON.stringify(raw.location?.lngLat);
        assert.ok(raw.location?.lngLat, "stored fixture must contain raw coordinates");

        for (const result of [buildPublicMapCircleDto(raw), buildPinnedCircleDto(raw)]) {
            const serialized = JSON.stringify(result);
            assertPrivateDataAbsent(result);
            if (precision === 4) {
                assert.deepEqual(result.location?.lngLat, raw.location?.lngLat);
                assert.ok(serialized.includes(rawCoordinateSentinel));
            } else {
                assert.equal(result.location?.lngLat, undefined);
                assert.equal(serialized.includes(rawCoordinateSentinel), false);
            }
        }

        if (precision < 3) {
            assert.equal(buildPublicMapCircleDto(raw).location?.street, undefined);
            assert.equal(buildPinnedCircleDto(raw).location?.street, undefined);
        }
    });
}

test("public map DTO retains only non-location metrics and map eligibility", () => {
    const result = buildPublicMapCircleDto(makeRawCircle(4));
    assert.deepEqual(result.metrics, {
        similarity: 0.3,
        recentness: 0.6,
        popularity: 0.7,
    });
    assert.deepEqual(result.mapEligibility, { profileComplete: true });
    assert.equal(result.createdAt?.toISOString(), "2026-01-02T03:04:05.000Z");
});

test("near sorting does not encode hidden precision 0-3 coordinates", async () => {
    const user = makeRawCircle(4);
    user.location!.lngLat = { lng: 0, lat: 0 };

    const makeHiddenPair = (firstLng: number, secondLng: number) => {
        const first = makeRawCircle(2);
        first._id = "first";
        first.location!.lngLat = { lng: firstLng, lat: 0 };
        const second = makeRawCircle(3);
        second._id = "second";
        second.location!.lngLat = { lng: secondLng, lat: 0 };
        return [first, second];
    };

    const buildNearMetrics = async (_user: Circle | undefined, circle: Circle): Promise<Metrics> => {
        const lng = circle.location?.lngLat?.lng;
        return lng === undefined ? { rank: 0.5 } : { distance: lng, proximity: 1 - lng / 20000, rank: lng };
    };
    const nearFirst = await applyPublicMapMetricsAndSort(
        makeHiddenPair(1, 100),
        user,
        new Date(),
        buildNearMetrics,
        "near",
    );
    const nearSecond = await applyPublicMapMetricsAndSort(
        makeHiddenPair(100, 1),
        user,
        new Date(),
        buildNearMetrics,
        "near",
    );

    assert.deepEqual(
        nearFirst.map((circle) => circle._id),
        nearSecond.map((circle) => circle._id),
    );
    for (const circle of [...nearFirst, ...nearSecond]) {
        assert.equal(circle.metrics?.distance, undefined);
        assert.equal(circle.metrics?.proximity, undefined);
    }
});

test("near sorting may use permitted precision 4 coordinates", async () => {
    const user = makeRawCircle(4);
    user.location!.lngLat = { lng: 0, lat: 0 };
    const circles = [makeRawCircle(4), makeRawCircle(4)];
    circles[0]._id = "far";
    circles[0].location!.lngLat = { lng: 100, lat: 0 };
    circles[1]._id = "near";
    circles[1].location!.lngLat = { lng: 1, lat: 0 };

    const sorted = await applyPublicMapMetricsAndSort(
        circles,
        user,
        new Date(),
        async (_user, circle) => {
            const lng = circle.location?.lngLat?.lng;
            return lng === undefined ? {} : { proximity: 1 - lng / 20000, rank: lng };
        },
        "near",
    );
    assert.deepEqual(
        sorted.map((circle) => circle._id),
        ["near", "far"],
    );
    assert.ok(sorted.every((circle) => circle.metrics?.proximity !== undefined));
});
