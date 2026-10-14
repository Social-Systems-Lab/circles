import assert from "node:assert/strict";
// @ts-expect-error Bun provides module mocking at runtime; this repository does not install Bun type declarations.
import { mock, test } from "bun:test";
import { ObjectId } from "mongodb";
import type { Circle } from "@/models/models";
import type { CreateCircleDependencies } from "./circle";

const unusedCollection = { createIndex: async () => "mock-index" };

mock.module("./db", () => ({
    client: {},
    db: {},
    Circles: {},
    ServerSettingsCollection: {},
    Members: {},
    MembershipRequests: {},
    Feeds: {},
    Posts: {},
    Comments: {},
    Reactions: {},
    Skills: {},
    Sdgs: {},
    ChatRooms: {},
    ChatMessages: {},
    ChatRoomMembers: unusedCollection,
    Challenges: {},
    Proposals: {},
    Issues: {},
    Tasks: {},
    FundingAsks: {},
    Goals: {},
    Events: {},
    EventRsvps: {},
    EventInvitations: {},
    EventOccurrences: {},
    EventOccurrenceRsvps: {},
    EventOccurrenceInvitations: {},
    GoalMembers: {},
    RankedLists: {},
    AggregateRanks: unusedCollection,
    UserNotificationSettings: {},
    DefaultNotificationSettings: {},
    Notifications: unusedCollection,
    ChatConversations: unusedCollection,
    ChatMessageDocs: unusedCollection,
    ChatReadStates: unusedCollection,
    ChatTopicReadStates: {},
    MessageEmailReminders: unusedCollection,
    ExternalNotificationChannels: unusedCollection,
    PlatformBroadcastMessages: {},
    StripeWebhookEvents: {},
    UserRelationships: unusedCollection,
    HumanityVerifications: unusedCollection,
    PlatformSettingsCollection: {},
    PlatformAuditEvents: {},
    PrivateMediaCollection: {},
    getDb: async () => ({}),
    ensureRequiredChatIndexes: async () => undefined,
}));

const { createCircle, deleteNewlyCreatedCircle } = await import("./circle");
const { createCircleWithCanonicalCreatorMembership } = await import("./circle-creation");
const { assertCanSetCircleVisibility } = await import("./circle-visibility-policy");
const { upsertEligiblePublicCircleVectors } = await import("./circle-vector-publication");

const superadminDid = "did:example:superadmin";

type CreationState = { inserted?: Circle; publicVectorCalls: number };

function creationDependencies(state: CreationState): CreateCircleDependencies {
    return {
        assertCanSetCircleVisibility: (input) =>
            assertCanSetCircleVisibility(input, { isSuperAdminDid: async (did) => did === superadminDid }),
        findCircleByHandle: async () => null,
        insertCircle: async (circle) => {
            state.inserted = { ...circle };
            return { insertedId: new ObjectId() };
        },
        upsertVbdCircles: async (circles) =>
            upsertEligiblePublicCircleVectors(circles, {
                loadCanonicalCircles: async () => circles,
                preparePublication: async () => {
                    state.publicVectorCalls += 1;
                },
                formatCircle: (circle) => circle.name ?? "",
                embedTexts: async (texts) => texts,
                buildPoint: (_circle, text) => text,
                upsertPoints: async () => undefined,
                deleteCircles: async () => undefined,
                assertCirclesAbsent: async () => undefined,
            }),
        createDefaultChatRooms: async () => [],
        createDefaultFeed: async () => null,
    };
}

const input = (overrides: Partial<Circle> = {}): Circle => ({
    name: "Created Circle",
    handle: "created-circle",
    circleType: "circle",
    ...overrides,
});

test("Circle creation policies and canonical creator membership", async () => {
    const secretState: CreationState = { publicVectorCalls: 0 };
    const secret = await createCircle(
        input({ visibility: "secret", picture: { url: "/images/default-picture.png" }, images: [] }),
        superadminDid,
        creationDependencies(secretState),
    );
    assert.equal(secret.visibility, "secret", "a platform superadmin can create a new Secret Circle");
    assert.equal(secretState.inserted?.visibility, "secret", "Secret visibility is persisted at insert time");
    assert.deepEqual(secretState.inserted?.picture, { url: "/images/default-picture.png" });
    assert.deepEqual(secretState.inserted?.images, [], "Secret creation persists no creation-time gallery media");
    assert.equal(secretState.publicVectorCalls, 0, "a new Secret Circle never reaches public vector publication");

    await assert.rejects(
        createCircle(
            input({ visibility: "secret" }),
            "did:example:ordinary",
            creationDependencies({ publicVectorCalls: 0 }),
        ),
        /superadmin/,
        "a forged Secret submission is rejected using the authenticated DID",
    );
    await assert.rejects(
        createCircle(
            input({ circleType: "user", visibility: "secret", handle: "profile" }),
            superadminDid,
            creationDependencies({ publicVectorCalls: 0 }),
        ),
        /superadmin/,
        "a user profile Circle cannot be Secret even for a superadmin",
    );

    const membershipCalls: Array<{ userDid: string; circleId: string; groups: string[] }> = [];
    const createdWithMembership = await createCircleWithCanonicalCreatorMembership(
        input({ visibility: "secret" }),
        superadminDid,
        {
            createCircle: (circle, did) => createCircle(circle, did, creationDependencies({ publicVectorCalls: 0 })),
            addMember: async (userDid, circleId, groups) => {
                membershipCalls.push({ userDid, circleId, groups });
                return { userDid, circleId, userGroups: groups };
            },
            deleteCircle: async () => undefined,
        },
    );
    assert.deepEqual(membershipCalls, [
        {
            userDid: superadminDid,
            circleId: createdWithMembership.circle._id?.toString(),
            groups: ["admins", "moderators", "members"],
        },
    ]);

    await assert.rejects(
        createCircleWithCanonicalCreatorMembership(input({ visibility: "secret" }), "did:example:ordinary", {
            createCircle: async (circle) => ({ ...circle, _id: new ObjectId() }),
            addMember: async () => {
                throw new Error("membership insert failed");
            },
            deleteCircle: async () => undefined,
        }),
        /membership insert failed/,
        "membership insertion failure must reject instead of falsely reporting creation success",
    );

    const publicState: CreationState = { publicVectorCalls: 0 };
    const publicCircle = await createCircle(input(), "did:example:ordinary", creationDependencies(publicState));
    assert.equal(publicCircle.visibility, "public", "public remains the creation default");
    assert.equal(publicState.inserted?.visibility, "public", "the public default is persisted");
    assert.equal(publicState.publicVectorCalls, 1, "public Circle vector publication remains unchanged");
});

test("failed Secret creator membership removes the newly created Circle and generated artifacts", async () => {
    const createdId = new ObjectId();
    const circleId = createdId.toHexString();
    const unrelatedCircleId = new ObjectId().toHexString();
    const feedId = new ObjectId();
    const chatRoomIds = [new ObjectId(), new ObjectId()];
    const calls: Array<{ operation: string; filter: unknown }> = [];
    const vectorCalls: Array<{ operation: string; ids: string[] | string }> = [];
    const cleanupDependencies = {
        getCircle: async (requestedCircleId: string) => {
            calls.push({ operation: "getCircle", filter: requestedCircleId });
            return input({ _id: createdId, visibility: "secret" });
        },
        deleteCircleDocument: async (filter: { _id: ObjectId }) => {
            calls.push({ operation: "deleteCircleDocument", filter });
            return { deletedCount: 1 };
        },
        deleteMembers: async (filter: Record<string, unknown>) => calls.push({ operation: "deleteMembers", filter }),
        deleteMembershipRequests: async (filter: Record<string, unknown>) =>
            calls.push({ operation: "deleteMembershipRequests", filter }),
        findFeeds: async (filter: Record<string, unknown>) => {
            calls.push({ operation: "findFeeds", filter });
            return [{ _id: feedId }];
        },
        deleteFeeds: async (filter: Record<string, unknown>) => calls.push({ operation: "deleteFeeds", filter }),
        deletePosts: async (filter: Record<string, unknown>) => calls.push({ operation: "deletePosts", filter }),
        findChatRooms: async (filter: Record<string, unknown>, options: { projection: { _id: 1 } }) => {
            calls.push({ operation: "findChatRooms", filter: { filter, options } });
            return chatRoomIds.map((_id) => ({ _id }));
        },
        deleteChatRooms: async (filter: Record<string, unknown>) =>
            calls.push({ operation: "deleteChatRooms", filter }),
        deleteChatRoomMembers: async (filter: Record<string, unknown>) =>
            calls.push({ operation: "deleteChatRoomMembers", filter }),
        vectorCleanup: {
            deleteCircleVectors: async (ids: string[]) => {
                vectorCalls.push({ operation: "public", ids });
            },
            assertCircleVectorsAbsent: async (ids: string[]) => {
                vectorCalls.push({ operation: "assert-public", ids });
            },
            purgeDerivedVectors: async (id: string) => {
                vectorCalls.push({ operation: "derived", ids: id });
            },
        },
    };

    await assert.rejects(
        createCircleWithCanonicalCreatorMembership(input({ visibility: "secret" }), superadminDid, {
            createCircle: async (circle) => ({ ...circle, _id: createdId }),
            addMember: async () => {
                throw new Error("membership failed");
            },
            deleteCircle: (createdCircleId) => deleteNewlyCreatedCircle(createdCircleId, cleanupDependencies),
        }),
        /membership failed/,
    );

    assert.deepEqual(calls, [
        { operation: "findChatRooms", filter: { filter: { circleId }, options: { projection: { _id: 1 } } } },
        { operation: "getCircle", filter: circleId },
        { operation: "deleteCircleDocument", filter: { _id: createdId } },
        { operation: "deleteMembers", filter: { circleId } },
        { operation: "deleteMembershipRequests", filter: { circleId } },
        { operation: "findFeeds", filter: { circleId } },
        { operation: "deleteFeeds", filter: { circleId } },
        { operation: "deletePosts", filter: { feedId: feedId.toHexString() } },
        { operation: "deleteChatRooms", filter: { circleId } },
        {
            operation: "deleteChatRoomMembers",
            filter: { chatRoomId: { $in: chatRoomIds.map((id) => id.toHexString()) } },
        },
    ]);
    assert.deepEqual(vectorCalls, [
        { operation: "public", ids: [circleId] },
        { operation: "assert-public", ids: [circleId] },
        { operation: "derived", ids: circleId },
    ]);
    assert.equal(
        JSON.stringify({ calls, vectorCalls }).includes(unrelatedCircleId),
        false,
        "cleanup never targets an unrelated Circle ID",
    );

    let publicCleanupCalled = false;
    await assert.rejects(
        createCircleWithCanonicalCreatorMembership(input({ visibility: "public" }), "did:example:ordinary", {
            createCircle: async (circle) => ({ ...circle, _id: new ObjectId() }),
            addMember: async () => {
                throw new Error("public membership failed");
            },
            deleteCircle: async () => {
                publicCleanupCalled = true;
            },
        }),
        /public membership failed/,
    );
    assert.equal(publicCleanupCalled, false, "Public membership-failure cleanup behavior remains unchanged");
});
