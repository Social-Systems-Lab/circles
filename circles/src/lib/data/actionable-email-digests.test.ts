import assert from "node:assert/strict";
import { after, test } from "node:test";
import { ObjectId } from "mongodb";
import { getActionableEmailDigestCandidateUsers, processDailyActionableEmailDigests } from "./actionable-email-digests";

const originalToken = process.env.POSTMARK_API_TOKEN;
const originalSender = process.env.POSTMARK_SENDER_EMAIL;

process.env.POSTMARK_API_TOKEN = "test-token";
process.env.POSTMARK_SENDER_EMAIL = "digest@example.invalid";

const start = new Date("2026-09-22T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

type TestUser = {
    _id: ObjectId;
    did: string;
    email: string;
    lastActionableEmailDigestAt?: Date;
    lastActionableEmailDigestCheckedAt?: Date;
};

type TestNotification = {
    _id: ObjectId;
    type: "pm_received";
    createdAt: Date;
};

const makeUser = (index: number): TestUser => ({
    _id: new ObjectId(index.toString(16).padStart(24, "0")),
    did: `did:test:${index}`,
    email: `user-${index}@example.invalid`,
});

const compareCandidateOrder = (left: TestUser, right: TestUser) => {
    const leftChecked = left.lastActionableEmailDigestCheckedAt?.getTime();
    const rightChecked = right.lastActionableEmailDigestCheckedAt?.getTime();
    if (leftChecked === undefined && rightChecked !== undefined) return -1;
    if (leftChecked !== undefined && rightChecked === undefined) return 1;
    if (leftChecked !== rightChecked) return (leftChecked ?? 0) - (rightChecked ?? 0);
    return left._id.toHexString().localeCompare(right._id.toHexString());
};

function createCandidateCollection(users: TestUser[]) {
    const calls: Array<{ query: Record<string, unknown>; sort?: Record<string, 1 | -1>; limit?: number }> = [];
    const collection = {
        find(query: Record<string, unknown>) {
            const call = { query } as (typeof calls)[number];
            calls.push(call);
            const cutoff = (
                query.$and as Array<{
                    $or: Array<{ lastActionableEmailDigestAt?: { $lte?: Date } }>;
                }>
            )[0].$or[1].lastActionableEmailDigestAt?.$lte as Date;
            let limit = Number.POSITIVE_INFINITY;
            const cursor = {
                sort(sort: Record<string, 1 | -1>) {
                    call.sort = sort;
                    return cursor;
                },
                limit(value: number) {
                    call.limit = value;
                    limit = value;
                    return cursor;
                },
                async toArray() {
                    return users
                        .filter(
                            (user) => !user.lastActionableEmailDigestAt || user.lastActionableEmailDigestAt <= cutoff,
                        )
                        .sort(compareCandidateOrder)
                        .slice(0, limit);
                },
            };
            return cursor;
        },
    };
    return { collection, calls };
}

function createHarness(users: TestUser[], notificationsByDid: Map<string, TestNotification[]>) {
    const candidateStore = createCandidateCollection(users);
    const sentTo: string[] = [];
    const attemptedDids: string[] = [];
    const checkedDids: string[] = [];
    const notificationStamps: ObjectId[][] = [];
    let now = start;
    let shouldFail = (_did: string) => false;

    const dependencies = {
        now: () => now,
        getCandidateUsers: (cutoff: Date, limit: number) =>
            getActionableEmailDigestCandidateUsers(cutoff, limit, candidateStore.collection),
        getUnreadNotifications: async (userDid: string) => notificationsByDid.get(userDid) ?? [],
        sendEmail: async ({ to }: { to: string }) => {
            const user = users.find((candidate) => candidate.email === to);
            assert.ok(user);
            attemptedDids.push(user.did);
            if (shouldFail(user.did)) throw new Error("Postmark unavailable");
            sentTo.push(to);
        },
        markNotificationsEmailed: async (notificationIds: ObjectId[]) => {
            notificationStamps.push(notificationIds);
        },
        markUserDigestSent: async (userId: ObjectId, sentAt: Date) => {
            const user = users.find((candidate) => candidate._id.equals(userId));
            assert.ok(user);
            user.lastActionableEmailDigestAt = sentAt;
        },
        markUserDigestChecked: async (userId: ObjectId, checkedAt: Date) => {
            const user = users.find((candidate) => candidate._id.equals(userId));
            assert.ok(user);
            user.lastActionableEmailDigestCheckedAt = checkedAt;
            checkedDids.push(user.did);
        },
    };

    return {
        candidateStore,
        dependencies,
        sentTo,
        attemptedDids,
        checkedDids,
        notificationStamps,
        setNow: (value: Date) => {
            now = value;
        },
        setShouldFail: (value: (did: string) => boolean) => {
            shouldFail = value;
        },
    };
}

const oldNotification = (): TestNotification => ({
    _id: new ObjectId(),
    type: "pm_received",
    createdAt: new Date(start.getTime() - DAY_MS - 1),
});

test("bounded candidate rotation reaches an eligible user after 100 skipped users", async () => {
    const users = Array.from({ length: 101 }, (_, index) => makeUser(index + 1));
    const notifications = new Map([[users[100].did, [oldNotification()]]]);
    const harness = createHarness(users, notifications);

    const firstRun = await processDailyActionableEmailDigests(100, harness.dependencies);
    assert.deepEqual(firstRun, { scannedUsers: 100, eligibleUsers: 0, sent: 0, skipped: 100, failed: 0 });
    assert.equal(harness.checkedDids.length, 100);
    assert.equal(users[100].lastActionableEmailDigestCheckedAt, undefined);

    harness.setNow(new Date(start.getTime() + 60 * 60 * 1000));
    const secondRun = await processDailyActionableEmailDigests(100, harness.dependencies);
    assert.equal(secondRun.sent, 1);
    assert.equal(harness.sentTo[0], users[100].email);

    const queryCall = harness.candidateStore.calls[0];
    assert.deepEqual(queryCall.sort, { lastActionableEmailDigestCheckedAt: 1, _id: 1 });
    assert.equal(queryCall.limit, 100, "the real candidate selector retains its bound");
});

test("100 persistent failures rotate behind a later eligible recipient and remain retryable", async () => {
    const users = Array.from({ length: 101 }, (_, index) => makeUser(index + 1));
    const notifications = new Map(users.map((user) => [user.did, [oldNotification()]]));
    const harness = createHarness(users, notifications);
    harness.setShouldFail((did) => did !== users[100].did);
    const originalConsoleError = console.error;
    console.error = () => {};

    try {
        const firstRun = await processDailyActionableEmailDigests(100, harness.dependencies);
        assert.equal(firstRun.failed, 100);
        assert.equal(firstRun.sent, 0);
        assert.equal(harness.checkedDids.length, 100);

        harness.setNow(new Date(start.getTime() + 60 * 60 * 1000));
        const secondRun = await processDailyActionableEmailDigests(100, harness.dependencies);
        assert.equal(secondRun.sent, 1, "the previously blocked recipient is reached");
        assert.equal(harness.sentTo[0], users[100].email);
        assert.ok(
            harness.attemptedDids.filter((did) => did === users[0].did).length >= 2,
            "failed recipients remain eligible for retry",
        );
    } finally {
        console.error = originalConsoleError;
    }
});

test("one invocation evaluates no more than the candidate limit", async () => {
    const users = Array.from({ length: 150 }, (_, index) => makeUser(index + 1));
    const harness = createHarness(users, new Map());

    const result = await processDailyActionableEmailDigests(500, harness.dependencies);
    assert.equal(result.scannedUsers, 100);
    assert.equal(harness.checkedDids.length, 100);
    assert.equal(harness.candidateStore.calls[0].limit, 100);
});

test("successful sends remain excluded until the 24-hour interval expires", async () => {
    const user = makeUser(1);
    const harness = createHarness([user], new Map([[user.did, [oldNotification()]]]));

    assert.equal((await processDailyActionableEmailDigests(100, harness.dependencies)).sent, 1);
    harness.setNow(new Date(start.getTime() + DAY_MS - 1));
    assert.equal((await processDailyActionableEmailDigests(100, harness.dependencies)).scannedUsers, 0);
    harness.setNow(new Date(start.getTime() + DAY_MS));
    assert.equal((await processDailyActionableEmailDigests(100, harness.dependencies)).sent, 1);
});

test("notification age gate skips young activity and sends once it is old enough", async () => {
    const user = makeUser(1);
    const notification = { ...oldNotification(), createdAt: new Date(start.getTime() - DAY_MS + 1) };
    const harness = createHarness([user], new Map([[user.did, [notification]]]));

    const firstRun = await processDailyActionableEmailDigests(100, harness.dependencies);
    assert.equal(firstRun.skipped, 1);
    assert.equal(firstRun.sent, 0);
    assert.equal(user.lastActionableEmailDigestCheckedAt?.toISOString(), start.toISOString());

    harness.setNow(new Date(start.getTime() + 2));
    assert.equal((await processDailyActionableEmailDigests(100, harness.dependencies)).sent, 1);
});

test("send failure only updates the checked timestamp", async () => {
    const user = makeUser(1);
    const notification = oldNotification();
    const harness = createHarness([user], new Map([[user.did, [notification]]]));
    harness.setShouldFail(() => true);
    const originalConsoleError = console.error;
    console.error = () => {};

    try {
        const result = await processDailyActionableEmailDigests(100, harness.dependencies);
        assert.equal(result.sent, 0);
        assert.equal(result.failed, 1);
        assert.equal(user.lastActionableEmailDigestAt, undefined);
        assert.equal(harness.notificationStamps.length, 0);
        assert.equal(user.lastActionableEmailDigestCheckedAt?.toISOString(), start.toISOString());
    } finally {
        console.error = originalConsoleError;
    }
});

after(() => {
    if (originalToken === undefined) delete process.env.POSTMARK_API_TOKEN;
    else process.env.POSTMARK_API_TOKEN = originalToken;
    if (originalSender === undefined) delete process.env.POSTMARK_SENDER_EMAIL;
    else process.env.POSTMARK_SENDER_EMAIL = originalSender;
});
