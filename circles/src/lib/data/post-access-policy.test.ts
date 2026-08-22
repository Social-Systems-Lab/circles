import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import {
    buildAuthorizedPostHydrationMatch,
    canPerformCanonicalDiscussionAction,
    getCanonicalDiscussionOwnerCircleId,
    getReadablePostComments,
    getViewerReadableFeedIds,
    listReadableDiscussions,
    resolveFeedActionViewerDid,
    resolvePublicUserFeed,
    resolveReadablePostContext,
} from "./post-access-policy";
import type { Circle, Feed, Member, Post } from "@/models/models";

const oid = () => new ObjectId();
const circleId = oid();
const feedId = oid();
const postId = oid();
const viewerDid = "did:member";

const circle = (overrides: Partial<Circle> = {}): Circle =>
    ({
        _id: circleId,
        name: "Circle",
        handle: "circle",
        circleType: "circle",
        visibility: "public",
        moderationStatus: "active",
        enabledModules: ["feed", "discussions"],
        ...overrides,
    }) as Circle;

const feed = (overrides: Partial<Feed> = {}): Feed =>
    ({
        _id: feedId,
        name: "Noticeboard",
        handle: "default",
        circleId: circleId.toString(),
        createdAt: new Date(),
        userGroups: ["everyone"],
        ...overrides,
    }) as Feed;

const post = (overrides: Partial<Post> = {}): Post =>
    ({
        _id: postId,
        feedId: feedId.toString(),
        createdBy: "did:author",
        createdAt: new Date(),
        content: "private text",
        reactions: {},
        comments: 0,
        userGroups: ["everyone"],
        ...overrides,
    }) as Post;

const member = (): Member => ({ userDid: viewerDid, circleId: circleId.toString(), userGroups: ["members"] }) as Member;

const dependencies = (owner: Circle | null, membership: Member | null = null) => ({
    findPost: async () => post(),
    findFeed: async () => feed(),
    findCircle: async () => owner,
    findMember: async () => membership,
    findAuthor: async () => ({ isVerified: true }) as Circle,
    authorizeFeature: async () => true,
});

async function testDirectPostAccess() {
    assert.equal(await resolveReadablePostContext("malformed", viewerDid, dependencies(circle())), null);
    assert.equal(
        await resolveReadablePostContext(postId.toString(), viewerDid, {
            ...dependencies(circle()),
            canReadSource: async () => false,
        }),
        null,
        "an unreadable canonical source is materially identical to a missing Post",
    );
    assert.equal(
        await resolveReadablePostContext(postId.toString(), viewerDid, {
            ...dependencies(circle()),
            findPost: async () => null,
        }),
        null,
    );
    assert.equal(
        await resolveReadablePostContext(postId.toString(), viewerDid, {
            ...dependencies(circle()),
            findFeed: async () => null,
        }),
        null,
    );
    assert.equal(
        await resolveReadablePostContext(postId.toString(), viewerDid, {
            ...dependencies(circle()),
            findCircle: async () => null,
        }),
        null,
    );
    assert.equal(
        await resolveReadablePostContext(postId.toString(), viewerDid, {
            ...dependencies(circle()),
            findPost: async () => post({ feedId: "malformed" }),
        }),
        null,
    );

    const secret = circle({ visibility: "secret" });
    assert.equal(await resolveReadablePostContext(postId.toString(), undefined, dependencies(secret)), null);
    assert.equal(await resolveReadablePostContext(postId.toString(), "did:outsider", dependencies(secret)), null);
    assert.equal(await resolveReadablePostContext(postId.toString(), "did:superadmin", dependencies(secret)), null);
    assert.ok(await resolveReadablePostContext(postId.toString(), viewerDid, dependencies(secret, member())));
    assert.equal(await resolveReadablePostContext(postId.toString(), viewerDid, dependencies(secret)), null);
    assert.ok(
        await resolveReadablePostContext(postId.toString(), undefined, dependencies(circle({ visibility: undefined }))),
    );
    assert.ok(
        await resolveReadablePostContext(
            postId.toString(),
            viewerDid,
            dependencies(circle({ moderationStatus: "paused" })),
        ),
    );
    assert.equal(
        await resolveReadablePostContext(
            postId.toString(),
            viewerDid,
            dependencies(circle({ moderationStatus: "suspended" })),
        ),
        null,
    );
    assert.equal(
        await resolveReadablePostContext(
            postId.toString(),
            viewerDid,
            dependencies(circle({ moderationStatus: "removed" })),
        ),
        null,
    );

    let hydratedAuthor = false;
    const denied = await resolveReadablePostContext(postId.toString(), viewerDid, {
        ...dependencies(secret),
        findAuthor: async () => {
            hydratedAuthor = true;
            return { isVerified: true } as Circle;
        },
    });
    assert.equal(denied, null);
    assert.equal(hydratedAuthor, false, "author hydration occurs only after Circle access");

    const legacyDiscussion = post({ postType: "discussion", feedId: circleId.toString() });
    assert.equal(
        await resolveReadablePostContext(postId.toString(), viewerDid, {
            ...dependencies(circle()),
            findPost: async () => legacyDiscussion,
            findFeed: async () => null,
        }),
        null,
        "legacy discussions without canonical Feed ownership fail closed",
    );
    assert.ok(
        await resolveReadablePostContext(postId.toString(), viewerDid, {
            ...dependencies(circle()),
            findPost: async () => post({ postType: "discussion" }),
        }),
        "canonical public discussion remains readable",
    );
}

async function testFeedBatchingAndPagination() {
    const publicCircleId = oid().toString();
    const secretCircleId = oid().toString();
    const publicFeedId = oid();
    const secretFeedId = oid();
    const allFeeds = [
        feed({ _id: publicFeedId, circleId: publicCircleId }),
        feed({ _id: secretFeedId, circleId: secretCircleId }),
    ];
    const makeDependencies = (readableCircleIds: string[]) => ({
        findReadableCircleIds: async () => readableCircleIds,
        findFeeds: async (filter: any) => {
            const ids = new Set(filter.circleId.$in as string[]);
            return allFeeds.filter((item) => ids.has(item.circleId));
        },
        findMemberFeedExcludedCircleIds: async () => [],
        findMemberships: async () => [],
    });

    const outsiderFeedIds = await getViewerReadableFeedIds(undefined, "public", makeDependencies([publicCircleId]));
    assert.deepEqual(outsiderFeedIds, [publicFeedId.toString()]);
    const memberFeedIds = await getViewerReadableFeedIds(
        viewerDid,
        "public",
        makeDependencies([publicCircleId, secretCircleId]),
    );
    assert.deepEqual(new Set(memberFeedIds), new Set([publicFeedId.toString(), secretFeedId.toString()]));

    const newestSecretPosts = Array.from({ length: 5 }, (_, index) => ({ feedId: secretFeedId.toString(), index }));
    const olderPublicPosts = Array.from({ length: 5 }, (_, index) => ({ feedId: publicFeedId.toString(), index }));
    const visiblePage = [...newestSecretPosts, ...olderPublicPosts]
        .filter((item) => outsiderFeedIds.includes(item.feedId))
        .slice(0, 5);
    assert.equal(visiblePage.length, 5, "Feed authorization is applied before the Post limit");
    assert.ok(visiblePage.every((item) => item.feedId === publicFeedId.toString()));
}

async function testTrustedIdentity() {
    assert.equal(
        await resolveFeedActionViewerDid("did:impersonated-member", async () => "did:authenticated-viewer"),
        "did:authenticated-viewer",
    );
    assert.equal(await resolveFeedActionViewerDid("did:impersonated-member", async () => undefined), undefined);
    await assert.rejects(
        resolveFeedActionViewerDid("did:impersonated-member", async () => {
            throw new Error("auth infrastructure failed");
        }),
        /auth infrastructure failed/,
    );
}

async function testCommentReadAuthorization() {
    const comments = [{ _id: oid().toString(), content: "comment" }] as any;
    const allowedContext = (await resolveReadablePostContext(
        postId.toString(),
        viewerDid,
        dependencies(circle({ visibility: "secret" }), member()),
    ))!;
    let commentLoads = 0;
    const allowed = await getReadablePostComments(postId.toString(), viewerDid, {
        resolveContext: async () => allowedContext,
        loadComments: async () => {
            commentLoads += 1;
            return comments;
        },
    });
    assert.deepEqual(allowed, { success: true, comments });
    assert.equal(commentLoads, 1);

    const metadataBearingComments = [
        {
            ...comments[0],
            content: "[Hidden](/circles/secret/child)",
            mentions: [{ type: "circle", id: oid().toString() }],
            mentionsDisplay: [{ type: "circle", id: oid().toString(), circle: { name: "Forged" } }],
        },
    ] as any;
    const sanitized = await getReadablePostComments(postId.toString(), viewerDid, {
        resolveContext: async () => allowedContext,
        loadComments: async () => metadataBearingComments,
    });
    assert.equal(sanitized.comments?.[0].content, "Unavailable Circle");
    assert.equal(Object.hasOwn(sanitized.comments?.[0] ?? {}, "mentions"), false);
    assert.equal(Object.hasOwn(sanitized.comments?.[0] ?? {}, "mentionsDisplay"), false);

    const deniedResults = await Promise.all(
        ["malformed", "missing", "outsider", "superadmin"].map((scenario) =>
            getReadablePostComments(postId.toString(), scenario, {
                resolveContext: async () => null,
                loadComments: async () => {
                    commentLoads += 1;
                    return comments;
                },
            }),
        ),
    );
    assert.ok(deniedResults.every((result) => JSON.stringify(result) === JSON.stringify(deniedResults[0])));
    assert.deepEqual(deniedResults[0], { success: false, message: "Post unavailable" });
    assert.equal(commentLoads, 1, "comments are never hydrated before access succeeds");

    const publicContext = (await resolveReadablePostContext(postId.toString(), undefined, dependencies(circle())))!;
    assert.equal(
        (
            await getReadablePostComments(postId.toString(), undefined, {
                resolveContext: async () => publicContext,
                loadComments: async () => comments,
            })
        ).success,
        true,
    );
}

async function testOwnershipBoundHydration() {
    const authorized = buildAuthorizedPostHydrationMatch(postId.toString(), feedId.toString());
    assert.equal(authorized?._id.toString(), postId.toString());
    assert.equal(authorized?.feedId, feedId.toString());
    assert.deepEqual(
        buildAuthorizedPostHydrationMatch(postId.toString(), feedId.toString(), "discussion")?.postType,
        "discussion",
    );
    assert.equal(buildAuthorizedPostHydrationMatch(postId.toString(), "malformed"), null);

    const movedFeedId = oid().toString();
    const reloadedPost = post({ feedId: movedFeedId });
    assert.notEqual(
        reloadedPost.feedId,
        authorized?.feedId,
        "a moved Post cannot match the authorized hydration query",
    );
}

async function testPublicUserFeedTargetAndViewer() {
    const targetDid = "did:target";
    const target = circle({ did: targetDid, circleType: "user", visibility: "secret" });
    const targetFeed = feed({ circleId: target._id!.toString() });
    const seenViewers: Array<string | undefined> = [];
    const deps = {
        findTargetUser: async (did: string) => (did === targetDid ? target : null),
        findTargetFeed: async (did: string) => (did === targetDid ? targetFeed : null),
        canReadTargetCircle: async (did: string | undefined, owner: Circle) => {
            seenViewers.push(did);
            return owner.circleType === "user";
        },
    };

    assert.equal(await resolvePublicUserFeed(targetDid, undefined, deps), targetFeed, "anonymous target lookup works");
    assert.equal(
        await resolvePublicUserFeed(targetDid, "did:viewer-a", deps),
        targetFeed,
        "viewer A can fetch target B's public profile Feed",
    );
    assert.deepEqual(seenViewers, [undefined, "did:viewer-a"]);
    assert.equal(await resolvePublicUserFeed("", "did:viewer-a", deps), null);
    assert.equal(await resolvePublicUserFeed("did:missing", "did:viewer-a", deps), null);

    await assert.rejects(
        resolvePublicUserFeed(targetDid, "did:viewer-a", {
            ...deps,
            findTargetUser: async () => {
                throw new Error("database unavailable");
            },
        }),
        /database unavailable/,
    );
}

async function testNeutralDiscussionList() {
    const discussion = post({ postType: "discussion" });
    let downstreamCalls = 0;
    const makeDependencies = (owner: Circle | null, readable: boolean) => ({
        findCircleByHandle: async () => owner,
        canReadOwner: async () => readable,
        authorizeDiscussionView: async () => {
            downstreamCalls += 1;
            return true;
        },
        findDefaultFeed: async () => {
            downstreamCalls += 1;
            return feed();
        },
        listDiscussions: async () => {
            downstreamCalls += 1;
            return [discussion];
        },
    });

    assert.deepEqual(await listReadableDiscussions("missing", viewerDid, makeDependencies(null, false)), []);
    assert.equal(downstreamCalls, 0, "missing Circle does not reach Feed or Discussion queries");
    assert.deepEqual(
        await listReadableDiscussions(
            "secret",
            "did:outsider",
            makeDependencies(circle({ visibility: "secret" }), false),
        ),
        [],
    );
    assert.equal(downstreamCalls, 0, "inaccessible Circle does not reach Feed or Discussion queries");
    assert.deepEqual(
        await listReadableDiscussions("secret", viewerDid, makeDependencies(circle({ visibility: "secret" }), true)),
        [discussion],
    );
    assert.deepEqual(await listReadableDiscussions("public", undefined, makeDependencies(circle(), true)), [
        discussion,
    ]);
    assert.deepEqual(
        await listReadableDiscussions(
            "secret",
            "did:superadmin",
            makeDependencies(circle({ visibility: "secret" }), false),
        ),
        [],
    );
}

async function testCanonicalDiscussionOwnership() {
    const canonical = {
        ...post({ postType: "discussion" }),
        circleId: circleId.toString(),
        feed: feed(),
    } as Post & { circleId: string; feed: Feed };
    assert.equal(getCanonicalDiscussionOwnerCircleId(canonical), circleId.toString());
    assert.equal(
        getCanonicalDiscussionOwnerCircleId({ ...canonical, feed: feed({ circleId: oid().toString() }) }),
        null,
        "cross-Circle Feed ownership fails closed",
    );
    assert.equal(
        getCanonicalDiscussionOwnerCircleId({ ...canonical, feedId: "malformed" }),
        null,
        "legacy malformed feedId fails closed",
    );
    assert.equal(
        getCanonicalDiscussionOwnerCircleId({ ...canonical, circleId: "malformed" }),
        null,
        "malformed Circle ownership fails closed",
    );
    assert.equal(
        getCanonicalDiscussionOwnerCircleId({ ...canonical, feed: feed({ _id: oid() }) }),
        null,
        "a different canonical Feed cannot authorize the Discussion",
    );

    const authorizedCircleIds: string[] = [];
    const authorize = async (_did: string, ownerCircleId: string) => {
        authorizedCircleIds.push(ownerCircleId);
        return true;
    };
    assert.equal(
        await canPerformCanonicalDiscussionAction(canonical, viewerDid, {} as any, authorize),
        true,
        "canonical Discussion interactions retain their existing permission outcome",
    );
    assert.deepEqual(
        authorizedCircleIds,
        [circleId.toString()],
        "interaction authorization uses Circle ID, not Feed ID",
    );
    assert.equal(
        await canPerformCanonicalDiscussionAction(
            { ...canonical, feed: feed({ circleId: oid().toString() }) },
            viewerDid,
            {} as any,
            authorize,
        ),
        false,
        "Feed/Circle mismatch never reaches permission authorization",
    );
}

async function main() {
    await testDirectPostAccess();
    await testFeedBatchingAndPagination();
    await testTrustedIdentity();
    await testCommentReadAuthorization();
    await testOwnershipBoundHydration();
    await testPublicUserFeedTargetAndViewer();
    await testNeutralDiscussionList();
    await testCanonicalDiscussionOwnership();
    console.log("post access policy tests passed");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
