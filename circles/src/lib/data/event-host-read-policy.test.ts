import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import type { EventProductionReaderDependencies } from "./event";

const viewerDid = "did:example:viewer";
const outsiderDid = "did:example:outsider";
const ids = {
    profile: new ObjectId(),
    public: new ObjectId(),
    publicTwo: new ObjectId(),
    legacy: new ObjectId(),
    secret: new ObjectId(),
    paused: new ObjectId(),
    suspended: new ObjectId(),
    removed: new ObjectId(),
    malformed: new ObjectId(),
};
const circles = [
    { _id: ids.profile, circleType: "user", did: viewerDid },
    { _id: ids.public, circleType: "circle", visibility: "public", moderationStatus: "active" },
    { _id: ids.publicTwo, circleType: "project", visibility: "public", moderationStatus: "active" },
    { _id: ids.legacy, circleType: "circle", moderationStatus: "active" },
    { _id: ids.secret, circleType: "circle", visibility: "secret", moderationStatus: "active" },
    { _id: ids.paused, circleType: "circle", visibility: "public", moderationStatus: "paused" },
    { _id: ids.suspended, circleType: "circle", visibility: "public", moderationStatus: "suspended" },
    { _id: ids.removed, circleType: "circle", visibility: "public", moderationStatus: "removed" },
    { _id: ids.malformed, circleType: "circle", visibility: "invalid", moderationStatus: "active" },
] as any[];

const event = (circleId: unknown, fields: Record<string, unknown> = {}) => ({
    _id: new ObjectId(),
    circleId,
    stage: "open",
    title: "visible title",
    createdBy: "did:example:creator",
    startAt: new Date("2030-01-01T10:00:00Z"),
    endAt: new Date("2030-01-01T11:00:00Z"),
    location: { lngLat: [1, 2] },
    ...fields,
});

function matchesCandidate(item: any, match: any) {
    if (match.stage && item.stage !== match.stage) return false;
    if (match["location.lngLat"]?.$exists && !item.location?.lngLat) return false;
    if (match.$or) {
        const matchesOr = match.$or.some((condition: any) => {
            if (condition.createdBy) return item.createdBy === condition.createdBy;
            if (condition._id?.$in) return condition._id.$in.some((id: ObjectId) => id.equals(item._id));
            return false;
        });
        if (!matchesOr) return false;
    }
    return true;
}

function productionDependencies(
    events: any[],
    options: {
        memberCircleIds?: string[];
        rsvpEventIds?: string[];
        invitedEventIds?: string[];
        profile?: boolean;
        batchStats?: {
            pageLimits: number[];
            circleReads: number;
            membershipReads: number;
            maxIn: number;
            occurrenceIn?: number[];
            occurrenceRsvpIn?: number[];
        };
    } = {},
): EventProductionReaderDependencies {
    const sorted = [...events].sort((a, b) => a._id.toString().localeCompare(b._id.toString()));
    const memberCircleIds = options.memberCircleIds ?? [];
    const rsvpEventIds = options.rsvpEventIds ?? [];
    const invitedEventIds = options.invitedEventIds ?? [];
    return {
        findCircle: async () => (options.profile ? (circles[0] as any) : null),
        authorize: async () => false,
        findViewer: async () => ({ hiddenCancelledEventIds: [] }) as any,
        findEventRsvps: async () =>
            rsvpEventIds.map((eventId) => ({ eventId, userDid: viewerDid, status: "going" }) as any),
        findOccurrenceRsvps: async (query) => {
            if (query.seriesId?.$in) options.batchStats?.occurrenceRsvpIn?.push(query.seriesId.$in.length);
            return [];
        },
        findOccurrences: async (query) => {
            options.batchStats?.occurrenceIn?.push(query.seriesId.$in.length);
            return [];
        },
        aggregateEvents: async (pipeline) => {
            const firstMatch = pipeline[0]?.$match;
            const boundedIds = (firstMatch?._id?.$in ??
                firstMatch?.$and?.find((part: any) => part._id?.$in)?._id?.$in) as ObjectId[] | undefined;
            assert.ok(boundedIds, "global production aggregate must receive a bounded ID match");
            options.batchStats && (options.batchStats.maxIn = Math.max(options.batchStats.maxIn, boundedIds.length));
            const wanted = new Set(boundedIds.map(String));
            return sorted
                .filter((item) => wanted.has(item._id.toString()))
                .filter(
                    (item) =>
                        item.visibility !== "private" ||
                        item.createdBy === viewerDid ||
                        rsvpEventIds.includes(item._id.toString()) ||
                        invitedEventIds.includes(item._id.toString()),
                )
                .map((item) => ({ ...item, _id: item._id.toString() })) as any;
        },
        hostPolicyDependencies: {
            findEventCandidatePage: async (match, afterId, limit) => {
                options.batchStats?.pageLimits.push(limit);
                return sorted
                    .filter((item) => matchesCandidate(item, match))
                    .filter((item) => !afterId || item._id.toString() > afterId.toString())
                    .slice(0, limit);
            },
            findCircles: async (circleIds) => {
                if (options.batchStats) options.batchStats.circleReads += 1;
                const wanted = new Set(circleIds.map(String));
                return circles.filter((circle) => wanted.has(circle._id.toString())) as any;
            },
            findMemberships: async (did, circleIds) => {
                if (options.batchStats) options.batchStats.membershipReads += 1;
                return memberCircleIds
                    .filter((circleId) => circleIds.includes(circleId))
                    .map((circleId) => ({ userDid: did, circleId }));
            },
        },
    };
}

async function main() {
    process.env.IS_BUILD = "true";
    const { getEventsByCircleId, getOpenEventsForList, getOpenEventsForMap } = await import("./event");
    const publicEvent = event(ids.public.toString(), { title: "public", createdBy: viewerDid });
    const secretEvent = event(ids.secret.toString(), { title: "must not leak", createdBy: viewerDid });

    assert.deepEqual(
        (await getOpenEventsForMap("", undefined, productionDependencies([publicEvent]))).map((e) => e.title),
        ["public"],
    );
    assert.deepEqual(await getOpenEventsForMap("", undefined, productionDependencies([secretEvent])), []);
    assert.deepEqual(await getOpenEventsForMap(outsiderDid, undefined, productionDependencies([secretEvent])), []);
    assert.deepEqual(
        (
            await getOpenEventsForMap(
                viewerDid,
                undefined,
                productionDependencies([secretEvent], { memberCircleIds: [ids.secret.toString()] }),
            )
        ).map((e) => e.title),
        ["must not leak"],
    );
    assert.deepEqual(
        (await getOpenEventsForMap(viewerDid, undefined, productionDependencies([publicEvent, secretEvent]))).map(
            (e) => e.title,
        ),
        ["public"],
        "denied Event must be absent rather than sanitized",
    );
    assert.deepEqual(await getOpenEventsForList(viewerDid, undefined, productionDependencies([secretEvent])), []);

    const toolbox = await getEventsByCircleId(
        ids.profile.toString(),
        viewerDid,
        undefined,
        true,
        true,
        productionDependencies([publicEvent, secretEvent], {
            profile: true,
            rsvpEventIds: [secretEvent._id.toString()],
            invitedEventIds: [secretEvent._id.toString()],
        }),
    );
    assert.deepEqual(
        toolbox.map((item) => item.title),
        ["public"],
        "creator/RSVP/invite must not bypass Secret hosts",
    );

    const policyCases = [
        [event(ids.paused.toString(), { title: "paused" }), true],
        [event(ids.legacy.toString(), { title: "legacy" }), true],
        [event(ids.public.toString(), { title: "all-public", hostCircleIds: [ids.publicTwo.toString()] }), true],
        [event(ids.public.toString(), { hostCircleIds: [ids.secret.toString()] }), false],
        [event(ids.public.toString(), { hostCircleIds: "malformed" }), false],
        [event(new ObjectId().toString()), false],
        [event(ids.malformed.toString()), false],
        [event(ids.suspended.toString()), false],
        [event(ids.removed.toString()), false],
    ] as const;
    for (const [candidate, expected] of policyCases) {
        const result = await getOpenEventsForList(outsiderDid, undefined, productionDependencies([candidate]));
        assert.equal(result.length === 1, expected);
    }

    const many = Array.from({ length: 205 }, (_, index) => event(ids.public.toString(), { title: `event-${index}` }));
    const batchStats = { pageLimits: [] as number[], circleReads: 0, membershipReads: 0, maxIn: 0 };
    const batched = await getOpenEventsForList(outsiderDid, undefined, productionDependencies(many, { batchStats }));
    assert.equal(batched.length, many.length);
    assert.ok(batchStats.pageLimits.length >= 3, "candidate source must be exhausted through bounded pages");
    assert.ok(
        batchStats.pageLimits.every((limit) => limit === 100),
        "batch size must be finite and stable",
    );
    assert.ok(batchStats.maxIn <= 100, "aggregate $in must remain bounded to one page");
    assert.equal(batchStats.circleReads, batchStats.pageLimits.length, "Circle reads are batched once per page");
    assert.equal(batchStats.membershipReads, 0, "public batches require no membership reads");

    const recurringPublic: any[] = [];
    let deniedIndex = 0;
    const toolboxCandidates = Array.from({ length: 220 }, (_, index) => {
        if (index % 15 === 0) {
            const denied =
                deniedIndex % 3 === 0
                    ? event(ids.secret.toString(), {
                          title: `denied-secret-${deniedIndex}`,
                          createdBy: viewerDid,
                          recurrence: { frequency: "daily", interval: 1, count: 1 },
                      })
                    : event(ids.public.toString(), {
                          title: `denied-malformed-${deniedIndex}`,
                          createdBy: viewerDid,
                          hostCircleIds: "malformed",
                          recurrence: { frequency: "daily", interval: 1, count: 1 },
                      });
            deniedIndex += 1;
            return denied;
        }
        const publicIndex = recurringPublic.length;
        const readable = event(ids.public.toString(), {
            title: `recurring-${String(publicIndex).padStart(3, "0")}`,
            createdBy: viewerDid,
            startAt: new Date(Date.UTC(2030, 0, 1, 0, publicIndex)),
            endAt: new Date(Date.UTC(2030, 0, 1, 0, publicIndex + 1)),
            recurrence: { frequency: "daily", interval: 1, count: 1 },
        });
        recurringPublic.push(readable);
        return readable;
    });
    const toolboxStats = {
        pageLimits: [] as number[],
        circleReads: 0,
        membershipReads: 0,
        maxIn: 0,
        occurrenceIn: [] as number[],
        occurrenceRsvpIn: [] as number[],
    };
    const recurringToolbox = await getEventsByCircleId(
        ids.profile.toString(),
        viewerDid,
        { from: new Date("2030-01-01T00:00:00Z"), to: new Date("2030-01-02T00:00:00Z") },
        true,
        true,
        productionDependencies(toolboxCandidates, {
            profile: true,
            rsvpEventIds: toolboxCandidates
                .filter((item) => item.circleId === ids.secret.toString())
                .map((item) => item._id.toString()),
            batchStats: toolboxStats,
        }),
    );
    assert.equal(recurringToolbox.length, recurringPublic.length);
    assert.deepEqual(
        recurringToolbox.map((item) => item.title),
        recurringPublic.map((item) => item.title),
        "global toolbox recurrence expansion preserves semantic ordering",
    );
    assert.ok(toolboxStats.pageLimits.length >= 3, "toolbox candidates span at least three bounded pages");
    assert.ok(toolboxStats.pageLimits.every((limit) => limit === 100));
    assert.ok(toolboxStats.maxIn <= 100, "toolbox aggregate $in remains page-bounded");
    assert.deepEqual(toolboxStats.occurrenceIn, [100, 100, 5]);
    assert.deepEqual(toolboxStats.occurrenceRsvpIn, [100, 100, 5]);
    assert.equal(toolboxStats.circleReads, toolboxStats.pageLimits.length, "Circle reads remain once per page");
    assert.ok(toolboxStats.membershipReads > 0, "Secret hosts exercise batched membership reads");
    assert.ok(
        toolboxStats.membershipReads <= toolboxStats.pageLimits.length,
        "membership reads remain bounded to at most one per page",
    );
    assert.equal(
        recurringToolbox.some((item) => item.title.startsWith("denied-")),
        false,
        "creator and RSVP participation do not bypass Secret or malformed hosts",
    );

    const malformedMany = Array.from({ length: 205 }, () =>
        event(ids.public.toString(), { hostCircleIds: "malformed" }),
    );
    const deniedStats = { pageLimits: [] as number[], circleReads: 0, membershipReads: 0, maxIn: 0 };
    assert.deepEqual(
        await getOpenEventsForList(
            outsiderDid,
            undefined,
            productionDependencies(malformedMany, { batchStats: deniedStats }),
        ),
        [],
    );
    assert.ok(deniedStats.pageLimits.length >= 3, "denied pages must still terminate at source exhaustion");

    const stuckDependencies = productionDependencies(many);
    const firstPage = [...many].sort((a, b) => a._id.toString().localeCompare(b._id.toString())).slice(0, 100);
    stuckDependencies.hostPolicyDependencies!.findEventCandidatePage = async () => firstPage as any;
    const originalError = console.error;
    console.error = () => {};
    try {
        await assert.rejects(
            getOpenEventsForList(outsiderDid, undefined, stuckDependencies),
            /pagination did not advance/,
            "non-advancing global Event pages must terminate safely",
        );
    } finally {
        console.error = originalError;
    }

    console.log("event production reader policy tests passed");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
