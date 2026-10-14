import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
// @ts-expect-error Bun's runtime mock API is available when this test is run with `bun test`.
import { mock } from "bun:test";
import { ObjectId } from "mongodb";

const circleId = new ObjectId().toString();
const state = {
    circle: {
        _id: new ObjectId(circleId),
        did: "did:owner",
        circleType: "circle",
        publishStatus: "published",
        moderationStatus: "active",
    } as any,
    aggregateReads: 0,
    pipeline: [] as any[],
};
const sensitiveSource = {
    name: "Safe Member",
    handle: "safe-member",
    pictureUrl: "https://example.test/member.png",
    _id: "PRIVATE_MEMBERSHIP_ID",
    userDid: "did:member",
    did: "PRIVATE_DUPLICATE_DID",
    circleId: "PRIVATE_CIRCLE_ID",
    userGroups: ["admins"],
    joinedAt: new Date(),
    description: "PRIVATE_DESCRIPTION",
    images: ["PRIVATE_IMAGES"],
    location: { precision: 1, street: "PRIVATE_STREET", lngLat: { lng: 1, lat: 2 } },
    members: 99,
    metrics: { distance: 1, proximity: 2, rank: 3 },
    metadata: { secret: true },
    questionnaireAnswers: { secret: "answer" },
    futureSecret: "PRIVATE_FUTURE_FIELD",
};

mock.module("server-only", () => ({}));
mock.module("@/lib/data/db", () => ({
    Circles: { findOne: async () => state.circle },
    Members: {
        aggregate: (pipeline: any[]) => {
            state.aggregateReads++;
            state.pipeline = pipeline;
            return { toArray: async () => [sensitiveSource] };
        },
    },
    ChatRoomMembers: {},
    MembershipRequests: {},
    Feeds: {},
    Posts: {},
    ChatRooms: {},
}));

const { getMemberDirectoryForViewer, getPublicMemberDirectory, getMemberDirectoryManagement } = await import(
    "./member-directory-data"
);
const { buildPublicMemberDirectoryEntryDto, buildMemberDirectoryManagementEntryDto, canExposePublicMemberDirectory } =
    await import("./member-directory");

test("published circles with missing, active, or paused moderation expose only the exact public DTO", async () => {
    for (const moderationStatus of [undefined, "active", "paused"]) {
        state.circle = { ...state.circle, circleType: "circle", publishStatus: "published", moderationStatus };
        const result = await getPublicMemberDirectory(circleId);
        assert.deepEqual(result, [
            { name: "Safe Member", handle: "safe-member", picture: { url: "https://example.test/member.png" } },
        ]);
        assert.deepEqual(Object.keys(result[0]).sort(), ["handle", "name", "picture"]);
        assert.deepEqual(Object.keys(result[0].picture!).sort(), ["url"]);
        for (const secret of [
            "PRIVATE_MEMBERSHIP_ID",
            "did:member",
            "PRIVATE_STREET",
            "distance",
            "PRIVATE_FUTURE_FIELD",
            "admins",
        ]) {
            assert.equal(JSON.stringify(result).includes(secret), false);
        }
    }
});

test("missing publication, draft, pending verification, suspended, removed, and missing circles return no roster", async () => {
    const deniedStates = [
        {},
        { moderationStatus: "active" },
        { publishStatus: "draft", moderationStatus: "active" },
        { publishStatus: "pending_verification", moderationStatus: "active" },
        { publishStatus: "published", moderationStatus: "suspended" },
        { publishStatus: "published", moderationStatus: "removed" },
    ];
    for (const denied of deniedStates) {
        state.circle = { _id: new ObjectId(circleId), circleType: "circle", ...denied };
        const readsBefore = state.aggregateReads;
        assert.deepEqual(await getPublicMemberDirectory(circleId), []);
        assert.equal(state.aggregateReads, readsBefore);
    }
    state.circle = null;
    assert.deepEqual(await getPublicMemberDirectory(circleId), []);
    assert.deepEqual(await getPublicMemberDirectory("not-an-object-id"), []);
});

test("published profile followers use the public DTO and the query excludes the profile owner", async () => {
    state.circle = {
        _id: new ObjectId(circleId),
        did: "did:owner",
        circleType: "user",
        publishStatus: "published",
        moderationStatus: "active",
    };
    assert.deepEqual(await getPublicMemberDirectory(circleId), [
        { name: "Safe Member", handle: "safe-member", picture: { url: "https://example.test/member.png" } },
    ]);
    assert.ok(state.pipeline.some((stage) => stage.$match?.userDid?.$ne === "did:owner"));

    await getMemberDirectoryManagement(circleId);
    assert.ok(state.pipeline.some((stage) => stage.$match?.userDid?.$ne === "did:owner"));
});

test("DTO builders whitelist fields and management DTO remains separately minimal", () => {
    assert.deepEqual(buildPublicMemberDirectoryEntryDto(sensitiveSource), {
        name: "Safe Member",
        handle: "safe-member",
        picture: { url: "https://example.test/member.png" },
    });
    assert.deepEqual(buildMemberDirectoryManagementEntryDto(sensitiveSource), {
        name: "Safe Member",
        handle: "safe-member",
        picture: { url: "https://example.test/member.png" },
        userDid: "did:member",
        userGroups: ["admins"],
    });
});

test("public policy is affirmative for publication and safe lifecycle, including future hidden circles", () => {
    assert.equal(canExposePublicMemberDirectory({ publishStatus: "published" }), true);
    assert.equal(canExposePublicMemberDirectory({ publishStatus: "published", moderationStatus: "active" }), true);
    assert.equal(canExposePublicMemberDirectory({ publishStatus: "published", moderationStatus: "paused" }), true);
    assert.equal(canExposePublicMemberDirectory({ publishStatus: "draft", moderationStatus: "active" }), false);
    assert.equal(
        canExposePublicMemberDirectory({ publishStatus: "pending_verification", moderationStatus: "active" }),
        false,
    );
    assert.equal(canExposePublicMemberDirectory({}), false);
    assert.equal(canExposePublicMemberDirectory({ moderationStatus: "active" }), false);
    assert.equal(
        canExposePublicMemberDirectory({
            publishStatus: "published",
            moderationStatus: "suspended",
            circleType: "user",
        }),
        false,
    );
    assert.equal(canExposePublicMemberDirectory({ publishStatus: "published", moderationStatus: "removed" }), false);
});

test("RSC boundary selects one authoritative row source and avoids positional or broad member paths", async () => {
    const moduleSource = readFileSync("src/components/modules/members/members.tsx", "utf8");
    const pageSource = readFileSync("src/app/circles/[handle]/followers/page.tsx", "utf8");
    const actionSource = readFileSync("src/components/modules/members/actions.ts", "utf8");
    assert.match(moduleSource, /getMemberDirectoryForViewer\(/);
    assert.doesNotMatch(moduleSource, /managementMembers|\.map\(\(member, index\)/);
    assert.doesNotMatch(moduleSource, /Promise\.all\(\[\s*getPublicMemberDirectory[\s\S]*getMemberDirectoryManagement/);
    const tableSource = readFileSync("src/components/modules/members/members-table.tsx", "utf8");
    assert.doesNotMatch(tableSource, /managementMembers|members\?\.\[index\]|members\[index\]/);
    assert.doesNotMatch(
        moduleSource + pageSource,
        /getMembersWithMetrics|getMembers\(|ContentDisplayWrapper|MemberDisplay/,
    );
    assert.match(actionSource, /getMember\(targetUserDid, circleId\)/);
    assert.match(actionSource, /isAuthorized\(userDid, circle\._id \?\? "", features\.general\.remove_lower_members\)/);
    assert.match(actionSource, /features\.general\.edit_lower_user_groups/);
    state.circle = {
        _id: new ObjectId(circleId),
        circleType: "circle",
        publishStatus: "published",
        moderationStatus: "active",
    };
    await getPublicMemberDirectory(circleId);
    const projection = state.pipeline.at(-1).$project;
    assert.deepEqual(projection, {
        _id: 0,
        name: "$userDetails.name",
        handle: "$userDetails.handle",
        pictureUrl: "$userDetails.picture.url",
    });
});

test("real directory orchestration never selects management rows without an authenticated userDid", async () => {
    const publishedCircle = {
        _id: new ObjectId(circleId),
        circleType: "circle",
        publishStatus: "published",
        moderationStatus: "active",
    } as any;
    state.circle = publishedCircle;
    let readsBefore = state.aggregateReads;
    const anonymousPublished = await getMemberDirectoryForViewer(circleId, publishedCircle, undefined, true);
    assert.deepEqual(anonymousPublished, {
        canManageMembers: false,
        members: [{ name: "Safe Member", handle: "safe-member", picture: { url: "https://example.test/member.png" } }],
    });
    assert.equal(state.aggregateReads, readsBefore + 1);
    assert.equal("userDid" in anonymousPublished!.members[0], false);
    assert.equal("userGroups" in anonymousPublished!.members[0], false);
    assert.equal(state.pipeline.at(-1).$project.userDid, undefined);

    const unpublishedCircle = { ...publishedCircle, publishStatus: "draft" };
    state.circle = unpublishedCircle;
    readsBefore = state.aggregateReads;
    assert.equal(await getMemberDirectoryForViewer(circleId, unpublishedCircle, undefined, true), null);
    assert.equal(state.aggregateReads, readsBefore);

    state.circle = publishedCircle;
    readsBefore = state.aggregateReads;
    const authenticatedManager = await getMemberDirectoryForViewer(circleId, publishedCircle, "did:manager", true);
    assert.deepEqual(authenticatedManager, {
        canManageMembers: true,
        members: [
            {
                name: "Safe Member",
                handle: "safe-member",
                picture: { url: "https://example.test/member.png" },
                userDid: "did:member",
                userGroups: ["admins"],
            },
        ],
    });
    assert.equal(state.aggregateReads, readsBefore + 1);
    assert.equal(state.pipeline.at(-1).$project.userDid, 1);
    assert.equal(state.pipeline.at(-1).$project.userGroups, 1);
});

test("manager rows remain authoritative when public and management source orders differ", () => {
    const publicRows = [
        { name: "A", handle: "a" },
        { name: "B", handle: "b" },
    ];
    const managementRows = [
        { name: "B", handle: "b", userDid: "did:b", userGroups: ["members"] },
        { name: "A", handle: "a", userDid: "did:a", userGroups: ["admins"] },
    ];

    const managerRows = managementRows;
    assert.deepEqual(
        managerRows.map(({ name, userDid, userGroups }) => ({ name, userDid, userGroups })),
        [
            { name: "B", userDid: "did:b", userGroups: ["members"] },
            { name: "A", userDid: "did:a", userGroups: ["admins"] },
        ],
    );
    assert.notDeepEqual(
        publicRows.map((member, index) => ({ name: member.name, userDid: managementRows[index].userDid })),
        managerRows.map(({ name, userDid }) => ({ name, userDid })),
    );
});

test("authorized management query contains only its explicit DTO", async () => {
    state.circle = {
        _id: new ObjectId(circleId),
        circleType: "circle",
        publishStatus: "published",
        moderationStatus: "active",
    };
    const result = await getMemberDirectoryManagement(circleId);
    assert.deepEqual(result, [
        {
            name: "Safe Member",
            handle: "safe-member",
            picture: { url: "https://example.test/member.png" },
            userDid: "did:member",
            userGroups: ["admins"],
        },
    ]);
    for (const secret of ["PRIVATE_MEMBERSHIP_ID", "PRIVATE_STREET", "distance", "PRIVATE_FUTURE_FIELD"])
        assert.equal(JSON.stringify(result).includes(secret), false);
});

test("authorized management data remains separate from an unpublished public roster", async () => {
    state.circle = {
        _id: new ObjectId(circleId),
        circleType: "circle",
        publishStatus: "draft",
        moderationStatus: "active",
    };
    assert.deepEqual(await getPublicMemberDirectory(circleId), []);
    assert.deepEqual(await getMemberDirectoryManagement(circleId), [
        {
            name: "Safe Member",
            handle: "safe-member",
            picture: { url: "https://example.test/member.png" },
            userDid: "did:member",
            userGroups: ["admins"],
        },
    ]);
});
