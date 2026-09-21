// Factory for a stand-in `@/lib/data/db` module. The real module opens a MongoClient the moment it
// is imported, so tests replace it with `mock.module` before importing the code under test:
//
//   const db = mockDb();
//   const { doSomething } = await import("./module-under-test");
//
// Every collection the real module exports is present as an empty FakeCollection, so modules that
// import collections the test does not care about still link. Use `--isolate` (see the `test:modules`
// script) so a mock installed by one test file cannot leak into another.

import { mock } from "bun:test";
import { FakeCollection } from "./fake-mongo";

export const DB_COLLECTION_EXPORTS = [
    "Circles",
    "ServerSettingsCollection",
    "Members",
    "MembershipRequests",
    "Feeds",
    "Posts",
    "Comments",
    "Reactions",
    "Skills",
    "Sdgs",
    "ChatRooms",
    "ChatMessages",
    "ChatRoomMembers",
    "Challenges",
    "Proposals",
    "Issues",
    "Tasks",
    "FundingAsks",
    "Goals",
    "Events",
    "EventRsvps",
    "EventInvitations",
    "EventOccurrences",
    "EventOccurrenceRsvps",
    "EventOccurrenceInvitations",
    "GoalMembers",
    "RankedLists",
    "AggregateRanks",
    "UserNotificationSettings",
    "DefaultNotificationSettings",
    "Notifications",
    "ChatConversations",
    "ChatMessageDocs",
    "ChatReadStates",
    "ChatTopicReadStates",
    "MessageEmailReminders",
    "ExternalNotificationChannels",
    "PlatformBroadcastMessages",
    "StripeWebhookEvents",
    "UserRelationships",
    "HumanityVerifications",
    "PlatformSettingsCollection",
    "PlatformAuditEvents",
    "PrivateMediaCollection",
] as const;

export type DbCollectionName = (typeof DB_COLLECTION_EXPORTS)[number];
export type DbMock = Record<DbCollectionName, FakeCollection> & {
    client: object;
    db: object;
    getDb: () => Promise<object>;
    ensureRequiredChatIndexes: () => Promise<void>;
};

export const createDbMock = (overrides: Partial<Record<string, unknown>> = {}): DbMock => {
    const collections = Object.fromEntries(
        DB_COLLECTION_EXPORTS.map((name) => [name, new FakeCollection()]),
    ) as Record<DbCollectionName, FakeCollection>;
    // Collections addressed by name, such as `db.collection("vibeIdSignInRequests")`, keep their
    // documents between calls just like the named exports do.
    const named = new Map<string, FakeCollection>();
    const db = {
        collection: (name: string) => {
            if (!named.has(name)) named.set(name, new FakeCollection());
            return named.get(name)!;
        },
    };

    return {
        ...collections,
        client: {},
        db,
        getDb: async () => db,
        ensureRequiredChatIndexes: async () => {},
        ...overrides,
    } as DbMock;
};

/** Create a fake db module and install it as `@/lib/data/db`. Call it before importing the code under test. */
export const mockDb = (overrides: Partial<Record<string, unknown>> = {}): DbMock => {
    const db = createDbMock(overrides);
    mock.module("@/lib/data/db", () => db);
    return db;
};

/** The collection the code under test gets from `db.collection(name)`, for collections that are not named exports. */
export const namedCollection = (db: DbMock, name: string): FakeCollection =>
    (db.db as { collection: (name: string) => FakeCollection }).collection(name);
